import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment } from '@/tests/support/factories'
import {
  DIGITAL_ENTRY_MARKER,
  deleteFuelingEvent,
  findUnbilledFuelings,
  isDigitalEntryReading,
  recordFuelingEvent,
} from '@/repositories/fueling-events.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('fueling-events.repo', () => {
  it('recordFuelingEvent creates a truck sheet and a fueling reading marked as digital entry', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })

    const reading = await recordFuelingEvent(db, {
      fuelTruckId: truck.id,
      truckNumber: 'T-9',
      date: '2026-07-03',
      sheetFuelType: 'jet_a',
      reading: { tail_number: 'N999AB', gallons_pumped: 200 },
    })

    expect(reading.line_number).toBe(1)
    expect(reading.reading_type).toBe('fueling')
    expect(isDigitalEntryReading(reading)).toBe(true)
    expect(reading.notes).toBe(DIGITAL_ENTRY_MARKER)
  })

  it('reuses the same day+truck sheet across multiple recordings and increments line_number', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })

    const first = await recordFuelingEvent(db, {
      fuelTruckId: truck.id,
      truckNumber: 'T-10',
      date: '2026-07-03',
      sheetFuelType: 'jet_a',
      reading: { tail_number: 'N001' },
    })
    const second = await recordFuelingEvent(db, {
      fuelTruckId: truck.id,
      truckNumber: 'T-10',
      date: '2026-07-03',
      sheetFuelType: 'jet_a',
      reading: { tail_number: 'N002' },
    })

    expect(second.line_number).toBe(2)
    expect(second.truck_sheet_id).toBe(first.truck_sheet_id)
  })

  it('findUnbilledFuelings returns fueling readings with no invoice line item attached', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const reading = await recordFuelingEvent(db, {
      fuelTruckId: truck.id,
      truckNumber: 'T-11',
      date: new Date().toISOString().slice(0, 10),
      sheetFuelType: 'jet_a',
      reading: { tail_number: 'N111' },
    })

    const unbilled = await findUnbilledFuelings(db)
    expect(unbilled.map((r) => r.id)).toContain(reading.id)
  })

  it('findUnbilledFuelings excludes readings already linked to an invoice line item', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const reading = await recordFuelingEvent(db, {
      fuelTruckId: truck.id,
      truckNumber: 'T-12',
      date: new Date().toISOString().slice(0, 10),
      sheetFuelType: 'jet_a',
      reading: { tail_number: 'N112' },
    })

    const { error: invoiceError, data: invoice } = await db
      .from('invoices')
      .insert({ invoice_number: 'INV-1', customer_name: 'Walk-up' })
      .select('id')
      .single()
    if (invoiceError) throw invoiceError
    const { error: lineError } = await db.from('invoice_line_items').insert({
      invoice_id: invoice.id,
      item_type: 'fuel',
      description: 'Jet A',
      truck_meter_reading_id: reading.id,
    })
    if (lineError) throw lineError

    const unbilled = await findUnbilledFuelings(db)
    expect(unbilled.map((r) => r.id)).not.toContain(reading.id)
  })

  it('deleteFuelingEvent removes the reading', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const reading = await recordFuelingEvent(db, {
      fuelTruckId: truck.id,
      truckNumber: 'T-13',
      date: '2026-07-03',
      sheetFuelType: 'jet_a',
      reading: {},
    })

    await deleteFuelingEvent(db, reading.id)

    const { data } = await db.from('truck_meter_readings').select('id').eq('id', reading.id).maybeSingle()
    expect(data).toBeNull()
  })
})
