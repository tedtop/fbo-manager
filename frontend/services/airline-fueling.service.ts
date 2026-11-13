import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'
import { pumpedGallons, type Register } from '@/lib/meter-gaps'
import { createTransaction, updateTransaction } from '@/repositories/transactions.repo'
import {
  createTruckMeterReadings,
  createTruckSheet,
  deleteTruckMeterReading,
  updateTruckMeterReading
} from '@/repositories/truck-sheets.repo'

type Db = SupabaseClient<Database>

export interface RegisterEntry {
  start: number
  stop: number
}

export interface AirlineFuelingInput {
  qtDispatchId: string
  truckId: number
  /** The truck's equipment_id ("12"), copied to a newly created sheet. */
  truckNumber: string
  /** YYYY-MM-DD, the local date of the fueling (the truck sheet's day). */
  date: string
  /** HH:mm, shown on the reading's line. */
  time: string
  tailNumber: string
  aircraftType?: string
  airline?: string
  plannedLbs: number
  calculatedGallons: number
  density: number
  before: { left: number; center: number | null; right: number }
  after: { left: number; center: number | null; right: number }
  registers: Partial<Record<Register, RegisterEntry>>
}

const sum3 = (t: { left: number; center: number | null; right: number }) => t.left + (t.center ?? 0) + t.right

/** Gallons through the filled registers; rolled-over registers count through the modulus; null when a register's stop is below its start. */
export function pumpedFromRegisters(registers: AirlineFuelingInput['registers']): number | null {
  let total = 0
  let any = false
  for (const e of Object.values(registers)) {
    if (!e) continue
    const p = pumpedGallons(e.start, e.stop)
    if (!p) return null
    total += p.gallons
    any = true
  }
  return any ? Math.round(total * 10) / 10 : null
}

export type SavedAirlineFueling = Tables<'fuel_transaction'> & { readings: Tables<'truck_meter_readings'>[] }

/** The fueling already saved for a QT dispatch, with its meter readings, or null. */
export async function findSavedAirlineFueling(db: Db, qtDispatchId: string): Promise<SavedAirlineFueling | null> {
  const { data, error } = await db
    .from('fuel_transaction')
    .select('*, readings:truck_meter_readings(*)')
    .eq('qt_dispatch_id', qtDispatchId)
    .eq('source', 'qt')
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as SavedAirlineFueling | null
}

/**
 * Saves one airline fueling: the fuel_transaction (created, or updated when this QT dispatch was saved before)
 * and one truck_meter_readings row per register used, on the truck's sheet for that day (created if missing).
 * Never refuses because of a meter gap: gaps are found later from the stored readings.
 */
export async function saveAirlineFueling(db: Db, input: AirlineFuelingInput): Promise<SavedAirlineFueling> {
  const pumped = pumpedFromRegisters(input.registers)
  if (pumped == null) throw new Error('Meter stop is below start: check the readings.')

  const fields = {
    fuel_truck_id: input.truckId,
    tail_number: input.tailNumber,
    customer_name: input.airline ?? null,
    fuel_type: 'jet_a' as const,
    density: input.density,
    quantity_lbs: input.plannedLbs,
    quantity_gallons: pumped,
    gallons_requested: Math.round(input.calculatedGallons * 10) / 10,
    gallons_delivered: pumped,
    fuel_request: `QT ${Math.round(input.plannedLbs)} lbs`,
    tank_reading_unit: 'lbs' as const,
    tank_reading_before_left: input.before.left,
    tank_reading_before_right: input.before.right,
    tank_reading_before_center: input.before.center,
    tank_reading_before_total: sum3(input.before),
    tank_reading_after_left: input.after.left,
    tank_reading_after_right: input.after.right,
    tank_reading_after_center: input.after.center,
    tank_reading_after_total: sum3(input.after)
  }

  const existing = await findSavedAirlineFueling(db, input.qtDispatchId)
  const tx = existing
    ? await updateTransaction(db, existing.id, fields)
    : await createTransaction(db, {
        ...fields,
        ticket_number: `QT-${input.qtDispatchId}`,
        qt_dispatch_id: input.qtDispatchId,
        source: 'qt',
        status: 'filled' as const,
        completed_at: new Date().toISOString()
      })

  // The truck's sheet for the day, one per truck and day (scans use the same row).
  const { data: sheetRow, error: sheetErr } = await db
    .from('truck_sheets')
    .select('*, readings:truck_meter_readings(line_number)')
    .eq('fuel_truck_id', input.truckId)
    .eq('sheet_date', input.date)
    .order('id')
    .limit(1)
    .maybeSingle()
  if (sheetErr) throw sheetErr
  const sheet = sheetRow ?? { ...(await createTruckSheet(db, {
    sheet_date: input.date,
    fuel_truck_id: input.truckId,
    truck_number: input.truckNumber,
    fuel_type: 'jet_a'
  })), readings: [] as { line_number: number }[] }
  let line = Math.max(0, ...sheet.readings.map((r) => r.line_number))

  const byMeter = new Map((existing?.readings ?? []).map((r) => [r.meter, r]))
  const toInsert: Parameters<typeof createTruckMeterReadings>[1] = []
  for (const meter of ['front', 'rear'] as const) {
    const entry = input.registers[meter]
    const old = byMeter.get(meter)
    if (!entry) {
      if (old && old.source === 'typed') await deleteTruckMeterReading(db, old.id)
      continue
    }
    const row = {
      reading_type: 'fueling' as const,
      meter,
      meter_start: entry.start,
      meter_end: entry.stop,
      gallons_pumped: pumpedGallons(entry.start, entry.stop)?.gallons ?? null,
      tail_number: input.tailNumber,
      aircraft_type: input.aircraftType ?? null,
      customer: input.airline ?? null,
      req_gals_or_lbs: `${Math.round(input.plannedLbs)} lbs`,
      service_time: input.time,
      fuel_transaction_id: tx.id,
      source: 'typed' as const
    }
    if (old) await updateTruckMeterReading(db, old.id, row)
    else toInsert.push({ ...row, truck_sheet_id: sheet.id, line_number: ++line })
  }
  await createTruckMeterReadings(db, toInsert)

  const saved = await findSavedAirlineFueling(db, input.qtDispatchId)
  return saved as SavedAirlineFueling
}
