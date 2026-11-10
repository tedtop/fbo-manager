import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment } from '@/tests/support/factories'
import { findSavedAirlineFueling, pumpedFromRegisters, saveAirlineFueling, type AirlineFuelingInput } from '../airline-fueling.service'
import { findTruckSheetsForEquipment } from '@/repositories/truck-sheets.repo'
import { findAnnotationsForTruck, saveGapAnnotation } from '@/repositories/meter-gaps.repo'
import { detectGaps } from '@/lib/meter-gaps'

const db = createTestClient()
beforeEach(async () => {
  await resetDatabase(db)
})

const base = (truckId: number, over: Partial<AirlineFuelingInput> = {}): AirlineFuelingInput => ({
  qtDispatchId: '555', truckId, truckNumber: '12', date: '2026-11-08', time: '07:30', tailNumber: 'N17448', aircraftType: 'E175',
  airline: 'United', plannedLbs: 20000, calculatedGallons: 1500, density: 6.79,
  before: { left: 2000, center: null, right: 2000 }, after: { left: 10000, center: null, right: 10000 },
  registers: { front: { start: 1000, stop: 2480.5 } }, ...over
})

describe('saveAirlineFueling', () => {
  it('stores the transaction and the typed meter reading together, and saving again updates instead of duplicating', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck', equipment_id: '12' })
    const saved = await saveAirlineFueling(db, base(truck.id))
    expect(saved.ticket_number).toBe('QT-555')
    expect(Number(saved.gallons_delivered)).toBe(1480.5)
    expect(Number(saved.gallons_requested)).toBe(1500)
    expect(Number(saved.tank_reading_after_total)).toBe(20000)
    expect(saved.tank_reading_before_center).toBeNull()
    expect(saved.readings).toHaveLength(1)
    expect(saved.readings[0]).toMatchObject({ meter: 'front', source: 'typed', fuel_transaction_id: saved.id })

    const again = await saveAirlineFueling(db, base(truck.id, { registers: { front: { start: 1000, stop: 2500 }, rear: { start: 50, stop: 60 } } }))
    expect(again.id).toBe(saved.id)
    expect(again.readings.map((r) => r.meter).sort()).toEqual(['front', 'rear'])
    expect(Number(again.gallons_delivered)).toBe(1510)
    const { count } = await db.from('fuel_transaction').select('*', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it('lands on the truck sheet of the day, where a following fueling with a wrong start is a gap that can be annotated', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck', equipment_id: '12' })
    await saveAirlineFueling(db, base(truck.id))
    await saveAirlineFueling(db, base(truck.id, { qtDispatchId: '556', registers: { front: { start: 2500, stop: 2700 } } }))
    const sheets = await findTruckSheetsForEquipment(db, truck.id, 50)
    expect(sheets).toHaveLength(1)
    expect(sheets[0].readings.map((r) => r.line_number)).toEqual([1, 2])
    const rep = detectGaps(sheets)
    expect(rep.gaps).toHaveLength(1)
    expect(rep.gaps[0]).toMatchObject({ expectedStart: 2480.5, actualStart: 2500, missingGallons: 19.5 })

    const note = await saveGapAnnotation(db, truck.id, rep.gaps[0], { reason: 'forgotten_fueling', note: 'GA jet at 8', resolved: false })
    expect(await findAnnotationsForTruck(db, truck.id)).toHaveLength(1)
    await saveGapAnnotation(db, truck.id, rep.gaps[0], { reason: 'forgotten_fueling', note: 'GA jet at 8', resolved: true }, note)
    expect((await findAnnotationsForTruck(db, truck.id))[0].resolved).toBe(true)
  })

  it('refuses a stop below the start and finds nothing for an unknown dispatch', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck', equipment_id: '12' })
    await expect(saveAirlineFueling(db, base(truck.id, { registers: { front: { start: 500, stop: 100 } } }))).rejects.toThrow(/below start/)
    expect(await findSavedAirlineFueling(db, 'nope')).toBeNull()
    expect(pumpedFromRegisters({ front: { start: 999_950, stop: 30 } })).toBe(80)
  })
})
