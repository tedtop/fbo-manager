import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeTank } from '@/tests/support/factories'
import { createTankReading } from '@/repositories/tank-readings.repo'
import { deleteTank, findAllTanks, findTankById, updateTank } from '@/repositories/tanks.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('tanks.repo', () => {
  it('returns null for a nonexistent tank_id', async () => {
    expect(await findTankById(db, 'NO-SUCH-TANK')).toBeNull()
  })

  it('findAllTanks reports latest_reading = null when a tank has no readings', async () => {
    await makeTank(db, { tank_id: 'T-EMPTY' })
    const [tank] = await findAllTanks(db)
    expect(tank.latest_reading).toBeNull()
  })

  it('findAllTanks attaches the most recent reading per tank', async () => {
    const tank = await makeTank(db, { tank_id: 'T-READ' })
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 40,
      recorded_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 55,
      recorded_at: new Date().toISOString(),
    })

    const [found] = await findAllTanks(db)
    expect(Number(found.latest_reading?.level)).toBe(55)
  })

  it('does not cross-contaminate latest_reading between tanks', async () => {
    const tankA = await makeTank(db, { tank_id: 'T-A' })
    const tankB = await makeTank(db, { tank_id: 'T-B' })
    await createTankReading(db, { tank_id: tankA.tank_id, level: 10, recorded_at: new Date().toISOString() })
    await createTankReading(db, { tank_id: tankB.tank_id, level: 90, recorded_at: new Date().toISOString() })

    const all = await findAllTanks(db)
    const a = all.find((t) => t.tank_id === 'T-A')
    const b = all.find((t) => t.tank_id === 'T-B')
    expect(Number(a?.latest_reading?.level)).toBe(10)
    expect(Number(b?.latest_reading?.level)).toBe(90)
  })

  it('updates and deletes a tank', async () => {
    const tank = await makeTank(db, { tank_id: 'T-EDIT', tank_name: 'Original' })
    const updated = await updateTank(db, tank.tank_id, { tank_name: 'Renamed' })
    expect(updated.tank_name).toBe('Renamed')

    await deleteTank(db, tank.tank_id);
    expect(await findTankById(db, tank.tank_id)).toBeNull()
  })
})
