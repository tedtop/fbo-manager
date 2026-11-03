import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeAircraft, makeFlight, makeParkingLocation, makeUser } from '@/tests/support/factories'
import { withTz } from '@/tests/support/with-tz'
import {
  apiFlightToComponentFlight,
  componentFlightToApiRequest,
} from '@/components/flight-operations/types'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import {
  createFlight,
  deleteFlight,
  findAllFlights,
  findFlightById,
  updateFlight,
} from '@/repositories/flights.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('flights.repo', () => {
  it('returns null for a nonexistent flight id', async () => {
    expect(await findFlightById(db, 999_999)).toBeNull()
  })

  it('joins aircraft, location, and created_by on findFlightById', async () => {
    const aircraft = await makeAircraft(db, { aircraft_type_display: 'Gulfstream G650' })
    const location = await makeParkingLocation(db, { description: 'Ramp 4' })
    const creator = await makeUser(db, { username: 'frontdesk-1', role: 'frontdesk' })

    const flight = await createFlight(db, {
      aircraft_id: aircraft.tail_number,
      scheduled_departure_time: new Date().toISOString(),
      location_id: location.id,
      created_by_id: creator.id,
    })

    const found = await findFlightById(db, flight.id)
    expect(found?.aircraft?.aircraft_type_display).toBe('Gulfstream G650')
    expect(found?.location?.description).toBe('Ramp 4')
    expect(found?.created_by?.username).toBe('frontdesk-1')
  })

  it('fails to create a flight for a nonexistent aircraft (FK guard)', async () => {
    const creator = await makeUser(db)
    await expect(
      createFlight(db, {
        aircraft_id: 'N-DOES-NOT-EXIST',
        scheduled_departure_time: new Date().toISOString(),
        created_by_id: creator.id,
      })
    ).rejects.toThrow()
  })

  it('filters by status', async () => {
    const scheduled = await makeFlight(db, { flight_status: 'scheduled' })
    await makeFlight(db, { flight_status: 'departed' })

    const results = await findAllFlights(db, { status: 'scheduled' })
    expect(results.map((f) => f.id)).toEqual([scheduled.id])
  })

  it('filters by today, excluding flights outside the current day', async () => {
    const todayFlight = await makeFlight(db, { scheduled_departure_time: new Date().toISOString() })
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    await makeFlight(db, { scheduled_departure_time: threeDaysAgo.toISOString() })

    const results = await findAllFlights(db, { today: true })
    expect(results.map((f) => f.id)).toEqual([todayFlight.id])
  })

  it('filters by startDate/endDate range', async () => {
    const inRange = await makeFlight(db, { scheduled_departure_time: '2026-03-15T10:00:00.000Z' })
    await makeFlight(db, { scheduled_departure_time: '2026-01-01T10:00:00.000Z' })
    await makeFlight(db, { scheduled_departure_time: '2026-06-01T10:00:00.000Z' })

    const results = await findAllFlights(db, { startDate: '2026-03-01', endDate: '2026-03-31' })
    expect(results.map((f) => f.id)).toEqual([inRange.id])
  })

  it('updates a flight', async () => {
    const flight = await makeFlight(db, { flight_status: 'scheduled' })
    const updated = await updateFlight(db, flight.id, { flight_status: 'arrived' })
    expect(updated.flight_status).toBe('arrived')
  })

  it('soft-deletes a flight: hidden from the board query, still findable by id', async () => {
    const kept = await makeFlight(db)
    const flight = await makeFlight(db)

    await deleteFlight(db, flight.id)

    const active = await findAllFlights(db)
    expect(active.map((f) => f.id)).toEqual([kept.id])

    const found = await findFlightById(db, flight.id)
    expect(found?.deleted_at).not.toBeNull()
  })

  // B10 / F5: startDate/endDate are LOCAL calendar days converted to UTC instants:
  // [local 00:00 of startDate, local 00:00 of the day after endDate).
  it('Phoenix (UTC-7): endDate is the local day, so 17:30 local on endDate is in and 00:00 local next day is out', () => {
    return withTz('America/Phoenix', async () => {
      // Mar 31 17:30 local = Apr 1 00:30Z (was wrongly excluded when the bound was UTC 23:59:59)
      const lateLocalDay = await makeFlight(db, { scheduled_departure_time: '2026-04-01T00:30:00.000Z' })
      const lastMinute = await makeFlight(db, { scheduled_departure_time: '2026-04-01T06:59:00.000Z' }) // Mar 31 23:59 local
      await makeFlight(db, { scheduled_departure_time: '2026-04-01T07:00:00.000Z' }) // Apr 1 00:00 local: out
      const firstMinute = await makeFlight(db, { scheduled_departure_time: '2026-03-01T07:00:00.000Z' }) // Mar 1 00:00 local
      await makeFlight(db, { scheduled_departure_time: '2026-03-01T06:59:00.000Z' }) // Feb 28 23:59 local: out

      const results = await findAllFlights(db, { startDate: '2026-03-01', endDate: '2026-03-31' })
      expect(results.map((f) => f.id).sort()).toEqual([lateLocalDay.id, lastMinute.id, firstMinute.id].sort())
    })
  })

  it('Denver: bounds follow DST (start 07:00Z in MST, end-exclusive 06:00Z in MDT)', () => {
    return withTz('America/Denver', async () => {
      const inFirst = await makeFlight(db, { scheduled_departure_time: '2026-03-01T07:00:00.000Z' })
      await makeFlight(db, { scheduled_departure_time: '2026-03-01T06:59:00.000Z' })
      const inLast = await makeFlight(db, { scheduled_departure_time: '2026-04-01T05:59:00.000Z' })
      await makeFlight(db, { scheduled_departure_time: '2026-04-01T06:00:00.000Z' })

      const results = await findAllFlights(db, { startDate: '2026-03-01', endDate: '2026-03-31' })
      expect(results.map((f) => f.id).sort()).toEqual([inFirst.id, inLast.id].sort())
    })
  })

  it('a 23:30 local flight is found on its own local day, not the next (Phoenix)', () => {
    return withTz('America/Phoenix', async () => {
      const flight = await makeFlight(db, { scheduled_departure_time: '2026-03-11T06:30:00.000Z' }) // Mar 10 23:30 local
      const onDay = await findAllFlights(db, { startDate: '2026-03-10', endDate: '2026-03-10' })
      expect(onDay.map((f) => f.id)).toEqual([flight.id])
      const nextDay = await findAllFlights(db, { startDate: '2026-03-11', endDate: '2026-03-11' })
      expect(nextDay).toEqual([])
    })
  })

  it('range filter also matches arrival-only flights (NULL departure) by scheduled arrival', () => {
    return withTz('America/Phoenix', async () => {
      const arrOnly = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-10T20:00:00.000Z',
        scheduled_departure_time: null,
      })
      await makeFlight(db, { scheduled_arrival_time: '2026-05-10T20:00:00.000Z', scheduled_departure_time: null })

      const results = await findAllFlights(db, { startDate: '2026-03-08', endDate: '2026-03-14' })
      expect(results.map((f) => f.id)).toEqual([arrOnly.id])
    })
  })

  it('a far-future week (> 4 weeks out) is returned when that week is requested', () => {
    return withTz('America/Phoenix', async () => {
      const future = await makeFlight(db, { scheduled_departure_time: '2026-12-16T18:00:00.000Z' })
      const results = await findAllFlights(db, { startDate: '2026-12-13', endDate: '2026-12-19' })
      expect(results.map((f) => f.id)).toEqual([future.id])
    })
  })

  it('combines the date range and status filters', async () => {
    const match = await makeFlight(db, {
      scheduled_departure_time: '2026-03-10T10:00:00.000Z',
      flight_status: 'arrived',
    })
    await makeFlight(db, { scheduled_departure_time: '2026-03-11T10:00:00.000Z', flight_status: 'scheduled' })
    await makeFlight(db, { scheduled_departure_time: '2026-05-11T10:00:00.000Z', flight_status: 'arrived' })

    const results = await findAllFlights(db, {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      status: 'arrived',
    })
    expect(results.map((f) => f.id)).toEqual([match.id])
  })

  it('create persists created_by_id and exposes it on the row', async () => {
    const creator = await makeUser(db, { username: 'creator-1' })
    const aircraft = await makeAircraft(db)

    const flight = await createFlight(db, {
      aircraft_id: aircraft.tail_number,
      scheduled_departure_time: new Date().toISOString(),
      created_by_id: creator.id,
    })

    expect(flight.created_by_id).toBe(creator.id)
    expect(flight.created_by?.username).toBe('creator-1')
  })

  // F8: live has flight.created_by_id DEFAULT 1 (every form-created flight is attributed to user 1,
  // see B17); the local schema mirrors that via migration 20261102000500. The flight form's create
  // path (hooks/use-flights.ts createMutation) never sends created_by_id.
  // KNOWN BUG F9: flips when B17 lands real creator attribution.
  const formPayload = (tail: string) => ({
    aircraft_id: tail,
    call_sign: 'N123AB',
    scheduled_arrival_time: '2026-03-10T14:00:00.000Z',
    scheduled_departure_time: '2026-03-10T14:45:00.000Z',
    flight_status: 'scheduled' as const,
    origin: 'KSFO',
    destination: 'KLAX',
    contact_name: 'Jane Pilot',
    contact_notes: 'Needs crew car',
    services: ['fuel', 'lav'],
    fuel_order_notes: '',
    passenger_count: 4,
    notes: 'VIP',
    created_by_source: 'line-department' as const,
  })

  it('F8: create without created_by_id needs the default user (id 1) to exist, else FK violation', async () => {
    const aircraft = await makeAircraft(db)
    // resetDatabase wipes `users`, so the default user 1 does not exist here.
    await expect(
      createFlight(db, formPayload(aircraft.tail_number) as Parameters<typeof createFlight>[1])
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('F8/F9: the exact form payload succeeds and is attributed to default user 1', async () => {
    const aircraft = await makeAircraft(db)
    await makeUser(db, { id: 1, username: 'default-flight-creator' })

    const created = await createFlight(
      db,
      formPayload(aircraft.tail_number) as Parameters<typeof createFlight>[1]
    )
    expect(created).toMatchObject({
      call_sign: 'N123AB',
      origin: 'KSFO',
      destination: 'KLAX',
      contact_name: 'Jane Pilot',
      services: ['fuel', 'lav'],
      passenger_count: 4,
      created_by_source: 'line-department',
      flight_status: 'scheduled',
      created_by_id: 1,
    })
  })

  it('F3: fuel_order_notes and location_id round-trip through the hook mapping and survive an unrelated update', async () => {
    const aircraft = await makeAircraft(db)
    const location = await makeParkingLocation(db)
    await makeUser(db, { id: 1, username: 'default-flight-creator' })

    const created = await createFlight(db, {
      ...formPayload(aircraft.tail_number),
      fuel_order_notes: 'Jet A 500 gal',
      location_id: location.id,
    } as Parameters<typeof createFlight>[1])
    expect(created.fuel_order_notes).toBe('Jet A 500 gal')
    expect(created.location_id).toBe(location.id)

    // Adapter -> update request -> repo, the same path the board uses.
    const flight = apiFlightToComponentFlight({
      id: created.id,
      aircraft: created.aircraft_id,
      fuel_order_notes: created.fuel_order_notes,
      location_id: created.location_id,
      created_at: created.created_at,
    })
    expect(flight).toMatchObject({ fuelOrderNotes: 'Jet A 500 gal', locationId: location.id })

    // Unrelated edit (a notes-only update) must not wipe either column.
    const req = componentFlightToApiRequest({ notes: 'edited' })
    const updated = await updateFlight(db, created.id, { notes: req.notes })
    expect(updated.notes).toBe('edited')
    expect(updated.fuel_order_notes).toBe('Jet A 500 gal')
    expect(updated.location_id).toBe(location.id)

    // Editing the notes themselves persists.
    const req2 = componentFlightToApiRequest({ fuelOrderNotes: 'Jet A 900 gal' })
    const again = await updateFlight(db, created.id, { fuel_order_notes: req2.fuel_order_notes })
    expect(again.fuel_order_notes).toBe('Jet A 900 gal')
    expect(again.location_id).toBe(location.id)
  })

  it('update with a stale expectedModifiedAt throws ConcurrencyConflictError and leaves the row unchanged', async () => {
    const flight = await makeFlight(db, { flight_status: 'scheduled' })
    const stale = flight.modified_at
    await updateFlight(db, flight.id, { notes: 'someone else edited' })

    await expect(
      updateFlight(db, flight.id, { flight_status: 'cancelled' }, stale)
    ).rejects.toBeInstanceOf(ConcurrencyConflictError)

    const found = await findFlightById(db, flight.id)
    expect(found?.flight_status).toBe('scheduled')
    expect(found?.notes).toBe('someone else edited')
  })

  it('update with the current expectedModifiedAt succeeds and bumps modified_at', async () => {
    const flight = await makeFlight(db, { flight_status: 'scheduled' })

    const updated = await updateFlight(
      db,
      flight.id,
      { flight_status: 'departed' },
      flight.modified_at
    )

    expect(updated.flight_status).toBe('departed')
    expect(updated.modified_at).not.toBe(flight.modified_at)
  })

  it('delete is a soft delete: the row remains with deleted_at set', async () => {
    const flight = await makeFlight(db)
    await deleteFlight(db, flight.id)

    const found = await findFlightById(db, flight.id)
    expect(found).not.toBeNull()
    expect(found?.deleted_at).not.toBeNull()
  })
})

// B09: scheduled/actual time model. Either scheduled time may be NULL (D6), never both.
describe('flights.repo time model', () => {
  async function base() {
    const [aircraft, creator] = await Promise.all([makeAircraft(db), makeUser(db)])
    return { aircraft_id: aircraft.tail_number, created_by_id: creator.id }
  }

  it('rejects a flight with neither scheduled time (CHECK flight_has_scheduled_time_check)', async () => {
    await expect(
      createFlight(db, {
        ...(await base()),
        scheduled_arrival_time: null,
        scheduled_departure_time: null,
      })
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts an arrival-only flight', async () => {
    const created = await createFlight(db, {
      ...(await base()),
      scheduled_arrival_time: '2026-03-10T14:00:00.000Z',
    })
    expect(created.scheduled_departure_time).toBeNull()
    expect(new Date(created.scheduled_arrival_time as string).toISOString()).toBe(
      '2026-03-10T14:00:00.000Z'
    )
  })

  it('accepts a departure-only flight', async () => {
    const created = await createFlight(db, {
      ...(await base()),
      scheduled_departure_time: '2026-03-10T14:00:00.000Z',
    })
    expect(created.scheduled_arrival_time).toBeNull()
  })

  it('rejects clearing both scheduled times on update', async () => {
    const flight = await makeFlight(db, { scheduled_arrival_time: null })
    await expect(
      updateFlight(db, flight.id, { scheduled_departure_time: null })
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('round-trips actual_arrival_time and actual_departure_time', async () => {
    const flight = await makeFlight(db)
    expect(flight.actual_arrival_time).toBeNull()
    expect(flight.actual_departure_time).toBeNull()

    await updateFlight(db, flight.id, {
      actual_arrival_time: '2026-03-10T14:07:00.000Z',
      actual_departure_time: '2026-03-10T15:02:00.000Z',
    })

    const found = await findFlightById(db, flight.id)
    expect(new Date(found?.actual_arrival_time as string).toISOString()).toBe('2026-03-10T14:07:00.000Z')
    expect(new Date(found?.actual_departure_time as string).toISOString()).toBe('2026-03-10T15:02:00.000Z')
  })

  it('is_quick_turn defaults to false and can be set', async () => {
    const flight = await makeFlight(db)
    expect(flight.is_quick_turn).toBe(false)

    const updated = await updateFlight(db, flight.id, { is_quick_turn: true })
    expect(updated.is_quick_turn).toBe(true)
  })
})
