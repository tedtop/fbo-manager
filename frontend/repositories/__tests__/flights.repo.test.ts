import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeAircraft, makeFlight, makeParkingLocation, makeUser } from '@/tests/support/factories'
import { withTz } from '@/tests/support/with-tz'
import {
  apiFlightToComponentFlight,
  componentFlightToApiRequest,
} from '@/components/flight-operations/types'
import { filterFlights } from '@/components/flight-operations/board-logic'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { localNextDayStartIso, formatLocalDate } from '@/lib/local-date'
import {
  createFlight,
  deleteFlight,
  findAllFlights,
  findFlightById,
  hiddenAtForStatusChange,
  setFlightHidden,
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
      tail_number: aircraft.tail_number,
      scheduled_departure_time: new Date().toISOString(),
      location_id: location.id,
      created_by_id: creator.id,
    })

    const found = await findFlightById(db, flight.id)
    expect(found?.aircraft?.aircraft_type_display).toBe('Gulfstream G650')
    expect(found?.location?.description).toBe('Ramp 4')
    expect(found?.created_by?.username).toBe('frontdesk-1')
  })

  it('embeds the aircraft parked area, or null when the aircraft has none', async () => {
    const { data: area, error } = await db
      .from('parking_area')
      .insert({ code: 'GH', name: 'Gold Hangars', kind: 'hangar' })
      .select()
      .single()
    if (error) throw error
    const parked = await makeAircraft(db, { parked_area_id: area.id })
    const loose = await makeAircraft(db)
    const parkedFlight = await makeFlight(db, { tail_number: parked.tail_number })
    const looseFlight = await makeFlight(db, { tail_number: loose.tail_number })

    const foundParked = await findFlightById(db, parkedFlight.id)
    expect(foundParked?.aircraft?.parked_area).toEqual({
      id: area.id,
      code: 'GH',
      name: 'Gold Hangars',
      kind: 'hangar',
    })
    const foundLoose = await findFlightById(db, looseFlight.id)
    expect(foundLoose?.aircraft?.parked_area).toBeNull()
  })

  it('fails to create a flight for a nonexistent aircraft (FK guard)', async () => {
    const creator = await makeUser(db)
    await expect(
      createFlight(db, {
        tail_number: 'N-DOES-NOT-EXIST',
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

  // B43: a flight is returned for any range its stay overlaps, including one that arrived before the range.
  it('returns a plane that arrived before the range and departs inside or after it', () => {
    return withTz('America/Phoenix', async () => {
      const departsInside = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-02T18:00:00.000Z',
        scheduled_departure_time: '2026-03-10T18:00:00.000Z',
      })
      const departsAfter = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-02T18:00:00.000Z',
        scheduled_departure_time: '2026-03-25T18:00:00.000Z',
      })
      const noDeparture = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-02T18:00:00.000Z',
        scheduled_departure_time: null,
      })
      await makeFlight(db, {
        scheduled_arrival_time: '2026-03-02T18:00:00.000Z',
        scheduled_departure_time: '2026-03-07T18:00:00.000Z', // left before the range
      })
      await makeFlight(db, {
        scheduled_arrival_time: '2026-03-20T18:00:00.000Z', // arrives after the range
        scheduled_departure_time: '2026-03-22T18:00:00.000Z',
      })

      const results = await findAllFlights(db, { startDate: '2026-03-08', endDate: '2026-03-14' })
      expect(results.map((f) => f.id).sort()).toEqual(
        [departsInside.id, departsAfter.id, noDeparture.id].sort()
      )
    })
  })

  it('a departure-only flight matches on its departure day only', () => {
    return withTz('America/Phoenix', async () => {
      const depOnly = await makeFlight(db, {
        scheduled_arrival_time: null,
        scheduled_departure_time: '2026-03-10T18:00:00.000Z',
      })
      const inRange = await findAllFlights(db, { startDate: '2026-03-10', endDate: '2026-03-10' })
      expect(inRange.map((f) => f.id)).toEqual([depOnly.id])
      expect(await findAllFlights(db, { startDate: '2026-03-11', endDate: '2026-03-11' })).toEqual([])
      expect(await findAllFlights(db, { startDate: '2026-03-01', endDate: '2026-03-09' })).toEqual([])
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
      tail_number: aircraft.tail_number,
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
    tail_number: tail,
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
      aircraft: created.tail_number,
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

  it('update with a stale expectedUpdatedAt throws ConcurrencyConflictError and leaves the row unchanged', async () => {
    const flight = await makeFlight(db, { flight_status: 'scheduled' })
    const stale = flight.updated_at
    await updateFlight(db, flight.id, { notes: 'someone else edited' })

    await expect(
      updateFlight(db, flight.id, { flight_status: 'cancelled' }, stale)
    ).rejects.toBeInstanceOf(ConcurrencyConflictError)

    const found = await findFlightById(db, flight.id)
    expect(found?.flight_status).toBe('scheduled')
    expect(found?.notes).toBe('someone else edited')
  })

  it('update with the current expectedUpdatedAt succeeds and bumps updated_at', async () => {
    const flight = await makeFlight(db, { flight_status: 'scheduled' })

    const updated = await updateFlight(
      db,
      flight.id,
      { flight_status: 'departed' },
      flight.updated_at
    )

    expect(updated.flight_status).toBe('departed')
    expect(updated.updated_at).not.toBe(flight.updated_at)
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
    return { tail_number: aircraft.tail_number, created_by_id: creator.id }
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

// B43b / D13: Today + Future (open-ended range) and hidden flights.
describe('flights.repo Today + Future and hidden', () => {
  const ids = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b)
  const sorted = (...rows: { id: number }[]) => ids(rows)

  it('startDate without endDate has no upper bound: every stay ending on or after that day', () => {
    return withTz('America/Phoenix', async () => {
      // Mar 10 local = [2026-03-10T07:00Z, 2026-03-11T07:00Z)
      const leftBefore = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-08T18:00:00.000Z',
        scheduled_departure_time: '2026-03-10T06:59:00.000Z', // Mar 9 23:59 local
      })
      const leavesStartOfDay = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-08T18:00:00.000Z',
        scheduled_departure_time: '2026-03-10T07:00:00.000Z',
      })
      const today = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-10T18:00:00.000Z',
        scheduled_departure_time: '2026-03-10T20:00:00.000Z',
      })
      const farFuture = await makeFlight(db, {
        scheduled_arrival_time: '2027-06-01T18:00:00.000Z',
        scheduled_departure_time: '2027-06-02T18:00:00.000Z',
      })
      const arrivalOnly = await makeFlight(db, {
        scheduled_arrival_time: '2026-03-01T18:00:00.000Z',
        scheduled_departure_time: null,
      })
      const departureOnlyFuture = await makeFlight(db, {
        scheduled_arrival_time: null,
        scheduled_departure_time: '2026-09-01T18:00:00.000Z',
      })
      const departureOnlyPast = await makeFlight(db, {
        scheduled_arrival_time: null,
        scheduled_departure_time: '2026-03-09T18:00:00.000Z',
      })

      const results = await findAllFlights(db, { startDate: '2026-03-10' })
      expect(ids(results)).toEqual(
        sorted(leavesStartOfDay, today, farFuture, arrivalOnly, departureOnlyFuture)
      )
      expect(ids(results)).not.toContain(leftBefore.id)
      expect(ids(results)).not.toContain(departureOnlyPast.id)
    })
  })

  it('hides hidden flights by default, lists them with includeHidden, and keeps a future hidden_at visible', async () => {
    const plain = await makeFlight(db)
    const hiddenByHand = await makeFlight(db, { hidden_at: new Date(Date.now() - 60_000).toISOString() })
    const hiddenTomorrow = await makeFlight(db, { hidden_at: new Date(Date.now() + 3_600_000).toISOString() })

    expect(ids(await findAllFlights(db))).toEqual(sorted(plain, hiddenTomorrow))
    expect(ids(await findAllFlights(db, { includeHidden: true }))).toEqual(
      sorted(plain, hiddenByHand, hiddenTomorrow)
    )
  })

  it('combines hidden with the date range and status filters', () => {
    return withTz('America/Phoenix', async () => {
      const shown = await makeFlight(db, {
        scheduled_departure_time: '2026-03-10T18:00:00.000Z',
        flight_status: 'departed',
        hidden_at: '2099-01-01T00:00:00.000Z',
      })
      const hidden = await makeFlight(db, {
        scheduled_departure_time: '2026-03-10T18:00:00.000Z',
        flight_status: 'departed',
        hidden_at: '2026-03-11T07:00:00.000Z',
      })
      await makeFlight(db, { scheduled_departure_time: '2026-03-10T18:00:00.000Z', flight_status: 'scheduled' })

      const range = { startDate: '2026-03-10', endDate: '2026-03-10', status: 'departed' }
      expect(ids(await findAllFlights(db, range))).toEqual([shown.id])
      expect(ids(await findAllFlights(db, { ...range, includeHidden: true }))).toEqual(sorted(shown, hidden))
    })
  })

  it('the server filter and filterFlights (board-logic) agree for Today + Future with hidden flights', () => {
    return withTz('America/Phoenix', async () => {
      const fixtures: Parameters<typeof makeFlight>[1][] = [
        { scheduled_arrival_time: '2026-03-08T18:00:00.000Z', scheduled_departure_time: '2026-03-10T06:59:00.000Z' },
        { scheduled_arrival_time: '2026-03-08T18:00:00.000Z', scheduled_departure_time: '2026-03-10T07:00:00.000Z' },
        { scheduled_arrival_time: '2026-03-10T18:00:00.000Z', scheduled_departure_time: '2026-03-10T20:00:00.000Z' },
        { scheduled_arrival_time: '2027-06-01T18:00:00.000Z', scheduled_departure_time: '2027-06-02T18:00:00.000Z' },
        { scheduled_arrival_time: '2026-03-01T18:00:00.000Z', scheduled_departure_time: null },
        { scheduled_arrival_time: null, scheduled_departure_time: '2026-09-01T18:00:00.000Z' },
        { scheduled_arrival_time: null, scheduled_departure_time: '2026-03-09T18:00:00.000Z' },
        { scheduled_departure_time: '2026-03-10T20:00:00.000Z', hidden_at: '2020-01-01T00:00:00.000Z' },
        { scheduled_departure_time: '2026-03-10T20:00:00.000Z', hidden_at: '2099-01-01T00:00:00.000Z' },
      ]
      for (const f of fixtures) await makeFlight(db, f)

      const toFlights = (rows: Awaited<ReturnType<typeof findAllFlights>>) =>
        rows.map((r) =>
          apiFlightToComponentFlight({
            id: r.id,
            aircraft: r.tail_number,
            scheduled_arrival_time: r.scheduled_arrival_time,
            scheduled_departure_time: r.scheduled_departure_time,
            hidden_at: r.hidden_at,
            created_at: r.created_at,
          })
        )
      const now = new Date(2026, 2, 10, 12) // Mar 10 local
      const filters = { search: '', status: 'all' as const, dateRange: 'today_future' as const, services: [] }

      for (const showHidden of [false, true]) {
        const server = await findAllFlights(db, { startDate: '2026-03-10', includeHidden: showHidden })
        // Same rows in, same rows out: the client filter over the unfiltered table matches the server filter.
        const everything = await findAllFlights(db, { includeHidden: true })
        const client = filterFlights(toFlights(everything), { ...filters, showHidden }, now)
        expect(client.map((f) => Number(f.id)).sort((a, b) => a - b)).toEqual(ids(server))
      }
    })
  })

  describe('Departed hides from the next day (hiddenAtForStatusChange)', () => {
    const open = { flight_status: 'arrived' as const, hidden_at: null, actual_departure_time: null }

    it('to Departed: the start of the day after the actual departure day (board zone)', () => {
      return withTz('America/Phoenix', () => {
        // 2026-03-10T23:30 local = 2026-03-11T06:30Z -> hidden from Mar 11 00:00 local = 07:00Z
        const at = hiddenAtForStatusChange(open, 'departed', '2026-03-11T06:30:00.000Z')
        expect(at).toBe('2026-03-11T07:00:00.000Z')
      })
    })

    it('without an actual departure it counts today: visible now, hidden from tomorrow', () => {
      const now = new Date(2026, 2, 10, 15, 0)
      expect(hiddenAtForStatusChange(open, 'departed', undefined, now)).toBe(
        localNextDayStartIso('2026-03-10')
      )
      // an explicitly cleared actual departure also counts today
      expect(
        hiddenAtForStatusChange(
          { ...open, actual_departure_time: '2026-03-01T18:00:00.000Z' },
          'departed',
          null,
          now
        )
      ).toBe(localNextDayStartIso('2026-03-10'))
    })

    it('uses the stored actual departure when the save does not carry one', () => {
      return withTz('America/Phoenix', () => {
        const at = hiddenAtForStatusChange(
          { ...open, actual_departure_time: '2026-03-10T18:00:00.000Z' },
          'departed',
          undefined
        )
        expect(at).toBe('2026-03-11T07:00:00.000Z')
      })
    })

    it('leaves hidden_at alone when the status does not change or the flight is already hidden', () => {
      expect(hiddenAtForStatusChange({ ...open, flight_status: 'departed' }, 'departed', undefined)).toBeUndefined()
      expect(
        hiddenAtForStatusChange({ ...open, hidden_at: '2026-03-10T18:00:00.000Z' }, 'departed', undefined)
      ).toBeUndefined()
      expect(hiddenAtForStatusChange(open, 'scheduled', undefined)).toBeUndefined()
    })

    it('away from Departed (a status correction) clears hidden_at', () => {
      expect(
        hiddenAtForStatusChange({ ...open, flight_status: 'departed', hidden_at: '2026-03-11T07:00:00.000Z' }, 'arrived', undefined)
      ).toBeNull()
    })

    it('stored with the status change, a flight departed yesterday is off the default board, one departed today is on it', () => {
      return withTz('America/Phoenix', async () => {
        const yesterday = new Date(Date.now() - 24 * 3_600_000).toISOString()
        const gone = await makeFlight(db, { flight_status: 'arrived' })
        await updateFlight(db, gone.id, {
          flight_status: 'departed',
          actual_departure_time: yesterday,
          hidden_at: hiddenAtForStatusChange({ ...open }, 'departed', yesterday),
        })
        const today = await makeFlight(db, { flight_status: 'arrived' })
        const updated = await updateFlight(db, today.id, {
          flight_status: 'departed',
          hidden_at: hiddenAtForStatusChange({ ...open }, 'departed', undefined),
        })
        expect(updated.hidden_at).not.toBeNull()
        expect(ids(await findAllFlights(db))).toContain(today.id)
        expect(ids(await findAllFlights(db))).not.toContain(gone.id)
        expect(ids(await findAllFlights(db, { includeHidden: true }))).toContain(gone.id)
      })
    })
  })

  describe('setFlightHidden', () => {
    it('Hide stores now(), Unhide clears it', async () => {
      const flight = await makeFlight(db)
      const before = Date.now()
      const hidden = await setFlightHidden(db, flight.id, true)
      expect(new Date(hidden.hidden_at as string).getTime()).toBeGreaterThanOrEqual(before - 1000)
      expect(ids(await findAllFlights(db))).not.toContain(flight.id)

      const shown = await setFlightHidden(db, flight.id, false)
      expect(shown.hidden_at).toBeNull()
      expect(ids(await findAllFlights(db))).toContain(flight.id)
    })

    it('respects expectedUpdatedAt: a stale card gets ConcurrencyConflictError and the flight stays visible', async () => {
      const flight = await makeFlight(db)
      const stale = flight.updated_at
      await updateFlight(db, flight.id, { notes: 'someone else edited' })

      await expect(setFlightHidden(db, flight.id, true, stale)).rejects.toBeInstanceOf(ConcurrencyConflictError)
      expect((await findFlightById(db, flight.id))?.hidden_at).toBeNull()
    })

    it('a general edit through the request mapper never writes hidden_at', async () => {
      const flight = await makeFlight(db)
      await setFlightHidden(db, flight.id, true)
      const component = apiFlightToComponentFlight({
        id: flight.id,
        aircraft: flight.tail_number,
        hidden_at: 'x',
        created_at: flight.created_at,
      })
      expect(component.hiddenAt).toBe('x')
      expect('hidden_at' in componentFlightToApiRequest(component)).toBe(false)
    })
  })
})
