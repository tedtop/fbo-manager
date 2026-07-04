import {
  createParkingLocation,
  findAllParkingLocations,
  findParkingLocationById,
  softDeleteParkingLocation,
  updateParkingLocation
} from '@/repositories/parking.repo'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('parking.repo', () => {
  it('returns null for a nonexistent location id', async () => {
    expect(await findParkingLocationById(db, 999_999)).toBeNull()
  })

  it('activeOnly (default) excludes locations with display_order <= 0', async () => {
    await createParkingLocation(db, {
      description: 'Active spot',
      display_order: 5
    })
    await createParkingLocation(db, {
      description: 'Zeroed spot',
      display_order: 0
    })

    const active = await findAllParkingLocations(db)
    expect(active.map((l) => l.description)).toEqual(['Active spot'])
  })

  it('activeOnly=false includes zeroed-out locations', async () => {
    await createParkingLocation(db, {
      description: 'Active spot',
      display_order: 5
    })
    await createParkingLocation(db, {
      description: 'Zeroed spot',
      display_order: 0
    })

    const all = await findAllParkingLocations(db, false)
    expect(all.map((l) => l.description).sort()).toEqual([
      'Active spot',
      'Zeroed spot'
    ])
  })

  it('softDeleteParkingLocation zeroes display_order instead of removing the row', async () => {
    const loc = await createParkingLocation(db, {
      description: 'To retire',
      display_order: 3
    })
    await softDeleteParkingLocation(db, loc.id)

    const stillThere = await findParkingLocationById(db, loc.id)
    expect(stillThere).not.toBeNull()
    expect(stillThere?.display_order).toBe(0)

    const active = await findAllParkingLocations(db)
    expect(active.find((l) => l.id === loc.id)).toBeUndefined()
  })

  it('updates a parking location', async () => {
    const loc = await createParkingLocation(db, { description: 'Gate A1' })
    const updated = await updateParkingLocation(db, loc.id, {
      description: 'Gate A2'
    })
    expect(updated.description).toBe('Gate A2')
  })
})
