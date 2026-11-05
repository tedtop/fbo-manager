import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import {
  createAircraft,
  deleteAircraft,
  findAircraftByTailNumber,
  findAllAircraft,
  updateAircraft,
  clearAircraftPosition,
  findParkedAircraft,
  setAircraftPosition,
} from '@/repositories/aircraft.repo'
import { createParkingArea } from '@/repositories/parking-area.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('aircraft.repo', () => {
  it('returns null for a tail number that does not exist', async () => {
    const result = await findAircraftByTailNumber(db, 'N999XX')
    expect(result).toBeNull()
  })

  it('creates and finds aircraft by its tail number (the primary key)', async () => {
    await createAircraft(db, {
      tail_number: 'N123AB',
      aircraft_type_icao: 'C172',
      aircraft_type_display: 'Cessna 172',
    })
    const found = await findAircraftByTailNumber(db, 'N123AB')
    expect(found?.aircraft_type_display).toBe('Cessna 172')
  })

  it('rejects creating a second aircraft with a duplicate tail number', async () => {
    await createAircraft(db, { tail_number: 'N555ZZ' })
    await expect(createAircraft(db, { tail_number: 'N555ZZ' })).rejects.toThrow()
  })

  it('lists all aircraft ordered by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N002BB' })
    await createAircraft(db, { tail_number: 'N001AA' })
    const all = await findAllAircraft(db)
    expect(all.map((a) => a.tail_number)).toEqual(['N001AA', 'N002BB'])
  })

  it('updates aircraft fields keyed by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N777CC', fleet_id: 'old-fleet' })
    const updated = await updateAircraft(db, 'N777CC', { fleet_id: 'new-fleet' })
    expect(updated.fleet_id).toBe('new-fleet')
  })

  it('deletes aircraft by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N888DD' })
    await deleteAircraft(db, 'N888DD')
    expect(await findAircraftByTailNumber(db, 'N888DD')).toBeNull()
  })
})

describe('aircraft.repo parked position', () => {
  it('setAircraftPosition stores lat/lng/heading/area and stamps parked_at', async () => {
    const area = await createParkingArea(db, { code: 'RAMP', name: 'Ramp' })
    await createAircraft(db, { tail_number: 'N100PK' })

    const parked = await setAircraftPosition(db, 'N100PK', {
      lat: 46.916321,
      lng: -114.090123,
      heading: 270,
      areaId: area.id,
    })

    expect(Number(parked.parked_lat)).toBeCloseTo(46.916321, 6)
    expect(Number(parked.parked_lng)).toBeCloseTo(-114.090123, 6)
    expect(parked.parked_heading).toBe(270)
    expect(parked.parked_area_id).toBe(area.id)
    expect(parked.parked_at).not.toBeNull()
  })

  it('setAircraftPosition allows no area (parked outside every polygon)', async () => {
    await createAircraft(db, { tail_number: 'N101PK' })
    const parked = await setAircraftPosition(db, 'N101PK', {
      lat: 46.9,
      lng: -114.0,
      heading: 0,
      areaId: null,
    })
    expect(parked.parked_area_id).toBeNull()
    expect(parked.parked_heading).toBe(0)
  })

  it('rejects an out-of-range heading and a lat without a lng', async () => {
    await createAircraft(db, { tail_number: 'N102PK' })
    await expect(
      setAircraftPosition(db, 'N102PK', { lat: 46.9, lng: -114.0, heading: 360, areaId: null })
    ).rejects.toThrow()
    await expect(updateAircraft(db, 'N102PK', { parked_lat: 46.9 })).rejects.toThrow()
  })

  it('clearAircraftPosition nulls every parked_* column', async () => {
    await createAircraft(db, { tail_number: 'N103PK' })
    await setAircraftPosition(db, 'N103PK', { lat: 46.9, lng: -114.0, heading: 90, areaId: null })

    const cleared = await clearAircraftPosition(db, 'N103PK')

    expect(cleared.parked_lat).toBeNull()
    expect(cleared.parked_lng).toBeNull()
    expect(cleared.parked_heading).toBeNull()
    expect(cleared.parked_area_id).toBeNull()
    expect(cleared.parked_at).toBeNull()
  })

  it('findParkedAircraft returns only parked aircraft, ordered by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N300PK' })
    await createAircraft(db, { tail_number: 'N200PK' })
    await createAircraft(db, { tail_number: 'N100NP' })
    await setAircraftPosition(db, 'N300PK', { lat: 46.9, lng: -114.0, heading: 10, areaId: null })
    await setAircraftPosition(db, 'N200PK', { lat: 46.9, lng: -114.0, heading: 20, areaId: null })

    const parked = await findParkedAircraft(db)
    expect(parked.map((a) => a.tail_number)).toEqual(['N200PK', 'N300PK'])
  })
})
