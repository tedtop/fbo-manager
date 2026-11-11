import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeTank } from '@/tests/support/factories'
import { createTankReading } from '@/repositories/tank-readings.repo'
import {
  clearLevelOverride,
  findLevelOverride,
  findLowestMeasured,
  setLevelOverride
} from '@/repositories/tank-level-override.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('tank-level-override.repo', () => {
  it('findLowestMeasured is null with no readings', async () => {
    const tank = await makeTank(db, { tank_id: 'T-NONE' })
    expect(await findLowestMeasured(db, tank.tank_id)).toBeNull()
  })

  it('findLowestMeasured returns the lowest level with its date, per tank', async () => {
    const a = await makeTank(db, { tank_id: 'T-LA' })
    const b = await makeTank(db, { tank_id: 'T-LB' })
    const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString()
    await createTankReading(db, { tank_id: a.tank_id, level: 50, recorded_at: day(1) })
    await createTankReading(db, { tank_id: a.tank_id, level: 12.5, recorded_at: day(2) })
    await createTankReading(db, { tank_id: a.tank_id, level: 70, recorded_at: day(3) })
    await createTankReading(db, { tank_id: b.tank_id, level: 3, recorded_at: day(4) })

    const low = await findLowestMeasured(db, a.tank_id)
    expect(low?.level).toBe(12.5)
    expect(new Date(low?.recordedAt as string).toISOString()).toBe(day(2))
  })

  it('has no override until one is set, then replaces it on the next set', async () => {
    const tank = await makeTank(db, { tank_id: 'T-OV' })
    expect(await findLevelOverride(db, tank.tank_id)).toBeNull()

    await setLevelOverride(db, tank.tank_id, 11.5)
    expect(Number((await findLevelOverride(db, tank.tank_id))?.lowest_level_inches)).toBe(11.5)

    await setLevelOverride(db, tank.tank_id, 9)
    expect(Number((await findLevelOverride(db, tank.tank_id))?.lowest_level_inches)).toBe(9)
  })

  it('clearing removes the override, and clearing again is a no-op', async () => {
    const tank = await makeTank(db, { tank_id: 'T-CLR' })
    await setLevelOverride(db, tank.tank_id, 8)
    await clearLevelOverride(db, tank.tank_id)
    expect(await findLevelOverride(db, tank.tank_id)).toBeNull()
    await expect(clearLevelOverride(db, tank.tank_id)).resolves.toBeUndefined()
  })

  it('rejects a negative override and never touches tank_level_min', async () => {
    const tank = await makeTank(db, { tank_id: 'T-NEG' })
    await expect(setLevelOverride(db, tank.tank_id, -1)).rejects.toBeTruthy()
    const { data } = await db.from('tank_level_min').select('*').eq('tank_id', tank.tank_id)
    expect(data).toEqual([])
    await setLevelOverride(db, tank.tank_id, 5)
    const after = await db.from('tank_level_min').select('*').eq('tank_id', tank.tank_id)
    expect(after.data).toEqual([])
  })
})
