import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeAircraft, makeFlight, makeParkingLocation, makeUser } from '@/tests/support/factories'
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
      departure_time: new Date().toISOString(),
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
        departure_time: new Date().toISOString(),
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
    const todayFlight = await makeFlight(db, { departure_time: new Date().toISOString() })
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    await makeFlight(db, { departure_time: threeDaysAgo.toISOString() })

    const results = await findAllFlights(db, { today: true })
    expect(results.map((f) => f.id)).toEqual([todayFlight.id])
  })

  it('filters by startDate/endDate range', async () => {
    const inRange = await makeFlight(db, { departure_time: '2026-03-15T10:00:00.000Z' })
    await makeFlight(db, { departure_time: '2026-01-01T10:00:00.000Z' })
    await makeFlight(db, { departure_time: '2026-06-01T10:00:00.000Z' })

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

  it('includes flights on endDate up to 23:59:59 and excludes the next day', async () => {
    const lastMoment = await makeFlight(db, { departure_time: '2026-03-31T23:59:00.000Z' })
    await makeFlight(db, { departure_time: '2026-04-01T00:30:00.000Z' })

    const results = await findAllFlights(db, { startDate: '2026-03-01', endDate: '2026-03-31' })
    expect(results.map((f) => f.id)).toEqual([lastMoment.id])
  })

  it('combines the date range and status filters', async () => {
    const match = await makeFlight(db, {
      departure_time: '2026-03-10T10:00:00.000Z',
      flight_status: 'arrived',
    })
    await makeFlight(db, { departure_time: '2026-03-11T10:00:00.000Z', flight_status: 'scheduled' })
    await makeFlight(db, { departure_time: '2026-05-11T10:00:00.000Z', flight_status: 'arrived' })

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
      departure_time: new Date().toISOString(),
      created_by_id: creator.id,
    })

    expect(flight.created_by_id).toBe(creator.id)
    expect(flight.created_by?.username).toBe('creator-1')
  })

  // F8: created_by_id is NOT NULL with no default on the local schema, and the flight form's
  // create path (hooks/use-flights.ts createMutation) never sends it. Pins current behavior.
  it('F8: create without created_by_id is rejected by the local schema (not-null violation)', async () => {
    const aircraft = await makeAircraft(db)
    await expect(
      createFlight(db, {
        aircraft_id: aircraft.tail_number,
        departure_time: new Date().toISOString(),
      } as Parameters<typeof createFlight>[1])
    ).rejects.toMatchObject({ code: '23502' })
  })

  it('F8: the exact payload the flight form sends on create fails without created_by_id', async () => {
    const aircraft = await makeAircraft(db)
    // Shape built by createMutation in hooks/use-flights.ts (no created_by_id).
    const formPayload = {
      aircraft_id: aircraft.tail_number,
      call_sign: 'N123AB',
      arrival_time: '2026-03-10T14:00:00.000Z',
      departure_time: '2026-03-10T14:45:00.000Z',
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
    }

    await expect(
      createFlight(db, formPayload as Parameters<typeof createFlight>[1])
    ).rejects.toMatchObject({ code: '23502' })

    const creator = await makeUser(db)
    const created = await createFlight(db, { ...formPayload, created_by_id: creator.id })
    expect(created).toMatchObject({
      call_sign: 'N123AB',
      origin: 'KSFO',
      destination: 'KLAX',
      contact_name: 'Jane Pilot',
      services: ['fuel', 'lav'],
      passenger_count: 4,
      created_by_source: 'line-department',
      flight_status: 'scheduled',
    })
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
