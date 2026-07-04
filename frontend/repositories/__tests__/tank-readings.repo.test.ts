import {
  createTankReading,
  findReadingsByTankId,
  findReadingsByTankIds
} from '@/repositories/tank-readings.repo'
import { createTestClient } from '@/tests/support/client'
import { makeTank } from '@/tests/support/factories'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

describe('tank-readings.repo', () => {
  it('findReadingsByTankId excludes readings older than the window (default 7 days)', async () => {
    const tank = await makeTank(db)
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 1,
      recorded_at: daysAgo(10)
    })
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 2,
      recorded_at: daysAgo(1)
    })

    const readings = await findReadingsByTankId(db, tank.tank_id)
    expect(readings).toHaveLength(1)
    expect(Number(readings[0].level)).toBe(2)
  })

  it('findReadingsByTankId respects a custom day window', async () => {
    const tank = await makeTank(db)
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 1,
      recorded_at: daysAgo(20)
    })

    expect(await findReadingsByTankId(db, tank.tank_id, 7)).toEqual([])
    expect(await findReadingsByTankId(db, tank.tank_id, 30)).toHaveLength(1)
  })

  it('orders readings by recorded_at descending', async () => {
    const tank = await makeTank(db)
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 1,
      recorded_at: daysAgo(2)
    })
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 2,
      recorded_at: daysAgo(1)
    })

    const readings = await findReadingsByTankId(db, tank.tank_id)
    expect(readings.map((r) => Number(r.level))).toEqual([2, 1])
  })

  it('findReadingsByTankIds spans multiple tanks and orders ascending by recorded_at', async () => {
    const tankA = await makeTank(db)
    const tankB = await makeTank(db)
    await createTankReading(db, {
      tank_id: tankA.tank_id,
      level: 10,
      recorded_at: daysAgo(2)
    })
    await createTankReading(db, {
      tank_id: tankB.tank_id,
      level: 20,
      recorded_at: daysAgo(1)
    })

    const readings = await findReadingsByTankIds(
      db,
      [tankA.tank_id, tankB.tank_id],
      7
    )
    expect(readings.map((r) => Number(r.level))).toEqual([10, 20])
  })

  it('findReadingsByTankIds with days=0 returns full history, ignoring the window', async () => {
    const tank = await makeTank(db)
    await createTankReading(db, {
      tank_id: tank.tank_id,
      level: 99,
      recorded_at: daysAgo(400)
    })

    expect(await findReadingsByTankIds(db, [tank.tank_id], 7)).toEqual([])
    const all = await findReadingsByTankIds(db, [tank.tank_id], 0)
    expect(all).toHaveLength(1)
  })
})
