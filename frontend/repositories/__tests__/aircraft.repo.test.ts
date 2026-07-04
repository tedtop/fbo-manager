import {
  createAircraft,
  deleteAircraft,
  findAircraftByTailNumber,
  findAllAircraft,
  updateAircraft
} from '@/repositories/aircraft.repo'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

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
      aircraft_type_display: 'Cessna 172'
    })
    const found = await findAircraftByTailNumber(db, 'N123AB')
    expect(found?.aircraft_type_display).toBe('Cessna 172')
  })

  it('rejects creating a second aircraft with a duplicate tail number', async () => {
    await createAircraft(db, { tail_number: 'N555ZZ' })
    await expect(
      createAircraft(db, { tail_number: 'N555ZZ' })
    ).rejects.toThrow()
  })

  it('lists all aircraft ordered by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N002BB' })
    await createAircraft(db, { tail_number: 'N001AA' })
    const all = await findAllAircraft(db)
    expect(all.map((a) => a.tail_number)).toEqual(['N001AA', 'N002BB'])
  })

  it('updates aircraft fields keyed by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N777CC', fleet_id: 'old-fleet' })
    const updated = await updateAircraft(db, 'N777CC', {
      fleet_id: 'new-fleet'
    })
    expect(updated.fleet_id).toBe('new-fleet')
  })

  it('deletes aircraft by tail_number', async () => {
    await createAircraft(db, { tail_number: 'N888DD' })
    await deleteAircraft(db, 'N888DD')
    expect(await findAircraftByTailNumber(db, 'N888DD')).toBeNull()
  })
})
