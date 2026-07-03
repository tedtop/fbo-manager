import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeAircraft, makeFlight, makeParkingLocation, makeUser } from '@/tests/support/factories'
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

  it('updates and deletes a flight', async () => {
    const flight = await makeFlight(db, { flight_status: 'scheduled' })
    const updated = await updateFlight(db, flight.id, { flight_status: 'arrived' })
    expect(updated.flight_status).toBe('arrived')

    await deleteFlight(db, flight.id)
    expect(await findFlightById(db, flight.id)).toBeNull()
  })
})
