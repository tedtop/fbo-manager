import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeTank } from '@/tests/support/factories'
import { createTankReading, findLowestMeasured } from '@/repositories/tank-readings.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('findLowestMeasured', () => {
  it('is null with no readings', async () => {
    const tank = await makeTank(db, { tank_id: 'T-NONE' })
    expect(await findLowestMeasured(db, tank.tank_id)).toBeNull()
  })

  it('returns the lowest level with its date, per tank', async () => {
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
})
