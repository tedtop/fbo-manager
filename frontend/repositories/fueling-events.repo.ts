import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Invoicing-side access to the truck-sheets tables (truck_sheets,
 * truck_meter_readings — owned by the Truck Sheets module, defined in
 * frontend/supabase/migrations/20260703000000_test_schema.sql).
 *
 * A truck_meter_readings row IS the fueling event. The OCR import creates
 * these from photographed sheets; digital ticket entry creates them here.
 * Invoices link to them via invoice_line_items.truck_meter_reading_id and
 * never store meter data of their own.
 */

export type TruckSheetRow = Tables<'truck_sheets'>
export type TruckMeterReadingRow = Tables<'truck_meter_readings'>
export type TruckMeterReadingInsert = TablesInsert<'truck_meter_readings'>

/**
 * Readings created by digital ticket entry carry this marker in notes, so
 * editing a draft ticket knows it may rewrite the reading (vs. an
 * OCR-imported reading, which the Truck Sheets module owns).
 */
export const DIGITAL_ENTRY_MARKER = 'Digital ticket entry (invoicing)'

export function isDigitalEntryReading(
  reading: Pick<TruckMeterReadingRow, 'notes'>
): boolean {
  return reading.notes === DIGITAL_ENTRY_MARKER
}

export type UnbilledFueling = TruckMeterReadingRow & {
  truck_sheet: Pick<
    TruckSheetRow,
    'id' | 'truck_number' | 'sheet_date' | 'fuel_type'
  > | null
  invoice_line_items: Array<{ id: number }>
}

/**
 * Recent fueling events with no invoice line attached — the "bill from
 * truck sheet" picker. PostgREST can't express NOT EXISTS, so we embed the
 * referencing line items and filter empties client-side; `days` keeps the
 * scan bounded.
 */
export async function findUnbilledFuelings(
  db: SupabaseClient<Database>,
  days = 14
): Promise<UnbilledFueling[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await db
    .from('truck_meter_readings')
    .select(
      '*, truck_sheet:truck_sheets!inner(id, truck_number, sheet_date, fuel_type), invoice_line_items(id)'
    )
    .eq('reading_type', 'fueling')
    .gte('truck_sheets.sheet_date', since.toISOString().slice(0, 10))
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = data as unknown as UnbilledFueling[]
  return rows.filter((r) => r.invoice_line_items.length === 0)
}

/**
 * Records a digitally-entered fueling event: find-or-create the truck's
 * sheet for the day, then append a reading row with the next line number.
 */
export async function recordFuelingEvent(
  db: SupabaseClient<Database>,
  input: {
    fuelTruckId: number
    truckNumber: string
    date: string // YYYY-MM-DD
    sheetFuelType: 'jet_a' | 'avgas'
    reading: Omit<
      TruckMeterReadingInsert,
      'truck_sheet_id' | 'line_number' | 'reading_type'
    >
  }
): Promise<TruckMeterReadingRow> {
  const { data: existing, error: findError } = await db
    .from('truck_sheets')
    .select('id')
    .eq('fuel_truck_id', input.fuelTruckId)
    .eq('sheet_date', input.date)
    .maybeSingle()
  if (findError) throw findError

  let sheetId = existing?.id
  if (sheetId == null) {
    const { data: created, error: createError } = await db
      .from('truck_sheets')
      .insert({
        sheet_date: input.date,
        fuel_truck_id: input.fuelTruckId,
        truck_number: input.truckNumber,
        fuel_type: input.sheetFuelType,
        notes: 'Created by invoicing (digital ticket entry)'
      })
      .select('id')
      .single()
    if (createError) throw createError
    sheetId = created.id
  }

  const { data: lastLine, error: lineError } = await db
    .from('truck_meter_readings')
    .select('line_number')
    .eq('truck_sheet_id', sheetId)
    .order('line_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lineError) throw lineError

  const { data: reading, error: readingError } = await db
    .from('truck_meter_readings')
    .insert({
      ...input.reading,
      truck_sheet_id: sheetId,
      line_number: (lastLine?.line_number ?? 0) + 1,
      reading_type: 'fueling',
      notes: DIGITAL_ENTRY_MARKER
    })
    .select()
    .single()
  if (readingError) throw readingError
  return reading
}

export async function deleteFuelingEvent(
  db: SupabaseClient<Database>,
  readingId: number
): Promise<void> {
  const { error } = await db
    .from('truck_meter_readings')
    .delete()
    .eq('id', readingId)
  if (error) throw error
}
