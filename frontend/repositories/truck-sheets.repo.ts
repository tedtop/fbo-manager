import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TruckSheetRow = Tables<'truck_sheets'>
export type TruckSheetInsert = TablesInsert<'truck_sheets'>
export type TruckSheetUpdate = TablesUpdate<'truck_sheets'>

export type TruckMeterReadingRow = Tables<'truck_meter_readings'>
export type TruckMeterReadingInsert = TablesInsert<'truck_meter_readings'>
export type TruckMeterReadingUpdate = TablesUpdate<'truck_meter_readings'>

export type TruckSheetWithReadings = TruckSheetRow & {
  readings: TruckMeterReadingRow[]
}

const SHEET_WITH_READINGS_SELECT = '*, readings:truck_meter_readings(*)'

export async function findAllTruckSheets(
  db: SupabaseClient<Database>
): Promise<TruckSheetWithReadings[]> {
  const { data, error } = await db
    .from('truck_sheets')
    .select(SHEET_WITH_READINGS_SELECT)
    .order('sheet_date', { ascending: false })
    .order('truck_number')
    .order('line_number', { referencedTable: 'truck_meter_readings' })
  if (error) throw error
  return data as TruckSheetWithReadings[]
}

export async function findTruckSheetById(
  db: SupabaseClient<Database>,
  id: number
): Promise<TruckSheetWithReadings | null> {
  const { data, error } = await db
    .from('truck_sheets')
    .select(SHEET_WITH_READINGS_SELECT)
    .eq('id', id)
    .order('line_number', { referencedTable: 'truck_meter_readings' })
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as TruckSheetWithReadings | null
}

export async function createTruckSheet(
  db: SupabaseClient<Database>,
  sheet: TruckSheetInsert
): Promise<TruckSheetRow> {
  const { data, error } = await db
    .from('truck_sheets')
    .insert(sheet)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTruckSheet(
  db: SupabaseClient<Database>,
  id: number,
  updates: TruckSheetUpdate
): Promise<TruckSheetRow> {
  const { data, error } = await db
    .from('truck_sheets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTruckSheet(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('truck_sheets').delete().eq('id', id)
  if (error) throw error
}

export async function createTruckMeterReadings(
  db: SupabaseClient<Database>,
  readings: TruckMeterReadingInsert[]
): Promise<TruckMeterReadingRow[]> {
  if (readings.length === 0) return []
  const { data, error } = await db
    .from('truck_meter_readings')
    .insert(readings)
    .select()
  if (error) throw error
  return data
}

export async function updateTruckMeterReading(
  db: SupabaseClient<Database>,
  id: number,
  updates: TruckMeterReadingUpdate
): Promise<TruckMeterReadingRow> {
  const { data, error } = await db
    .from('truck_meter_readings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTruckMeterReading(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('truck_meter_readings').delete().eq('id', id)
  if (error) throw error
}
