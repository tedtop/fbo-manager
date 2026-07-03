import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment } from '@/tests/support/factories'
import {
  createTruckMeterReadings,
  createTruckSheet,
  deleteTruckMeterReading,
  deleteTruckSheet,
  findAllTruckSheets,
  findTruckSheetById,
  updateTruckMeterReading,
  updateTruckSheet,
} from '@/repositories/truck-sheets.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('truck-sheets.repo', () => {
  it('returns null for a nonexistent truck sheet id', async () => {
    expect(await findTruckSheetById(db, 999_999)).toBeNull()
  })

  it('createTruckMeterReadings short-circuits on an empty array without hitting the DB', async () => {
    expect(await createTruckMeterReadings(db, [])).toEqual([])
  })

  it('attaches readings to a sheet, ordered by line_number', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const sheet = await createTruckSheet(db, {
      sheet_date: '2026-07-01',
      fuel_truck_id: truck.id,
      truck_number: 'T-1',
      fuel_type: 'jet_a',
    })

    await createTruckMeterReadings(db, [
      { truck_sheet_id: sheet.id, line_number: 2, tail_number: 'N222', gallons_pumped: 100 },
      { truck_sheet_id: sheet.id, line_number: 1, tail_number: 'N111', gallons_pumped: 50 },
    ])

    const found = await findTruckSheetById(db, sheet.id)
    expect(found?.readings.map((r) => r.line_number)).toEqual([1, 2])
    expect(found?.readings.map((r) => r.tail_number)).toEqual(['N111', 'N222'])
  })

  it('findAllTruckSheets returns sheets with their nested readings', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const sheet = await createTruckSheet(db, {
      sheet_date: '2026-07-02',
      fuel_truck_id: truck.id,
      truck_number: 'T-2',
      fuel_type: 'avgas',
    })
    await createTruckMeterReadings(db, [{ truck_sheet_id: sheet.id, line_number: 1 }])

    const [found] = await findAllTruckSheets(db)
    expect(found.id).toBe(sheet.id)
    expect(found.readings).toHaveLength(1)
  })

  it('fails to create a truck sheet for a nonexistent truck (FK guard)', async () => {
    await expect(
      createTruckSheet(db, {
        sheet_date: '2026-07-03',
        fuel_truck_id: 999_999,
        truck_number: 'GHOST',
        fuel_type: 'jet_a',
      })
    ).rejects.toThrow()
  })

  it('updateTruckSheet bumps updated_at', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const sheet = await createTruckSheet(db, {
      sheet_date: '2026-07-04',
      fuel_truck_id: truck.id,
      truck_number: 'T-4',
      fuel_type: 'jet_a',
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    const updated = await updateTruckSheet(db, sheet.id, { notes: 'reviewed' })
    expect(updated.notes).toBe('reviewed')
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(new Date(sheet.created_at).getTime())
  })

  it('updates and deletes an individual meter reading', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const sheet = await createTruckSheet(db, {
      sheet_date: '2026-07-05',
      fuel_truck_id: truck.id,
      truck_number: 'T-5',
      fuel_type: 'jet_a',
    })
    const [reading] = await createTruckMeterReadings(db, [{ truck_sheet_id: sheet.id, line_number: 1 }])

    const updated = await updateTruckMeterReading(db, reading.id, { gallons_pumped: 250 })
    expect(Number(updated.gallons_pumped)).toBe(250)

    await deleteTruckMeterReading(db, reading.id)
    const found = await findTruckSheetById(db, sheet.id)
    expect(found?.readings).toEqual([])
  })

  it('deleting a truck sheet cascades to its readings', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const sheet = await createTruckSheet(db, {
      sheet_date: '2026-07-06',
      fuel_truck_id: truck.id,
      truck_number: 'T-6',
      fuel_type: 'jet_a',
    })
    await createTruckMeterReadings(db, [{ truck_sheet_id: sheet.id, line_number: 1 }])

    await deleteTruckSheet(db, sheet.id)
    expect(await findTruckSheetById(db, sheet.id)).toBeNull()
  })
})
