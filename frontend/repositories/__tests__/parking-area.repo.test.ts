import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import {
  archiveParkingArea,
  createParkingArea,
  deleteParkingArea,
  findAllParkingAreas,
  findParkingAreaById,
  updateParkingArea,
} from '@/repositories/parking-area.repo'
import { createAircraft, findAircraftByTailNumber } from '@/repositories/aircraft.repo'

const db = createTestClient()

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-114.1, 46.9],
      [-114.0, 46.9],
      [-114.0, 47.0],
      [-114.1, 47.0],
      [-114.1, 46.9],
    ],
  ],
}

beforeEach(async () => {
  await resetDatabase(db)
})

describe('parking-area.repo', () => {
  it('returns null for a nonexistent area id', async () => {
    expect(await findParkingAreaById(db, 999_999)).toBeNull()
  })

  it('creates an area with defaults and round-trips the GeoJSON polygon', async () => {
    const area = await createParkingArea(db, { code: 'RAMP-1', name: 'Main ramp', polygon })
    expect(area.kind).toBe('ramp')
    expect(area.airport).toBe('MSO')
    expect(area.is_active).toBe(true)
    expect(area.polygon).toEqual(polygon)
    expect(await findParkingAreaById(db, area.id)).toMatchObject({ code: 'RAMP-1' })
  })

  it('rejects a duplicate code, an unknown kind, and a non-Polygon geometry', async () => {
    await createParkingArea(db, { code: 'A', name: 'A' })
    await expect(createParkingArea(db, { code: 'A', name: 'Dup' })).rejects.toThrow()
    await expect(
      createParkingArea(db, { code: 'B', name: 'B', kind: 'bogus' as never })
    ).rejects.toThrow()
    await expect(
      createParkingArea(db, { code: 'C', name: 'C', polygon: { type: 'Point', coordinates: [0, 0] } })
    ).rejects.toThrow()
  })

  it('lists active areas by display_order then code; includeInactive adds archived ones', async () => {
    await createParkingArea(db, { code: 'B', name: 'B', display_order: 1 })
    await createParkingArea(db, { code: 'A', name: 'A', display_order: 1 })
    await createParkingArea(db, { code: 'Z', name: 'Z', display_order: 0 })
    const gone = await createParkingArea(db, { code: 'GONE', name: 'Gone' })
    await archiveParkingArea(db, gone.id)

    expect((await findAllParkingAreas(db)).map((a) => a.code)).toEqual(['Z', 'A', 'B'])
    expect((await findAllParkingAreas(db, { includeInactive: true })).map((a) => a.code).sort()).toEqual(
      ['A', 'B', 'GONE', 'Z']
    )
  })

  it('archiveParkingArea sets is_active=false and keeps the row', async () => {
    const area = await createParkingArea(db, { code: 'T1', name: 'Tie-downs' })
    await archiveParkingArea(db, area.id)
    expect((await findParkingAreaById(db, area.id))?.is_active).toBe(false)
  })

  it('updates an area and bumps modified_at via the trigger', async () => {
    const area = await createParkingArea(db, { code: 'H1', name: 'Hangar 1', kind: 'hangar' })
    const updated = await updateParkingArea(db, area.id, { name: 'Hangar One' })
    expect(updated.name).toBe('Hangar One')
    expect(new Date(updated.modified_at).getTime()).toBeGreaterThanOrEqual(
      new Date(area.modified_at).getTime()
    )
  })

  it('deleteParkingArea removes the row and nulls aircraft.parked_area_id', async () => {
    const area = await createParkingArea(db, { code: 'DEL', name: 'Delete me' })
    await createAircraft(db, { tail_number: 'N1', parked_lat: 46.95, parked_lng: -114.05, parked_area_id: area.id })

    await deleteParkingArea(db, area.id)

    expect(await findParkingAreaById(db, area.id)).toBeNull()
    const plane = await findAircraftByTailNumber(db, 'N1')
    expect(plane?.parked_area_id).toBeNull()
    expect(plane?.parked_lat).not.toBeNull()
  })
})
