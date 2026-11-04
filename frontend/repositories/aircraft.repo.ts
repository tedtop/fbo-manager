import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type AircraftRow = Tables<'aircraft'>
export type AircraftInsert = TablesInsert<'aircraft'>
export type AircraftUpdate = TablesUpdate<'aircraft'>

export async function findAllAircraft(db: SupabaseClient<Database>): Promise<AircraftRow[]> {
  const { data, error } = await db.from('aircraft').select('*').order('tail_number')
  if (error) throw error
  return data
}

export async function findAircraftByTailNumber(
  db: SupabaseClient<Database>,
  tailNumber: string
): Promise<AircraftRow | null> {
  const { data, error } = await db
    .from('aircraft')
    .select('*')
    .eq('tail_number', tailNumber)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createAircraft(
  db: SupabaseClient<Database>,
  aircraft: AircraftInsert
): Promise<AircraftRow> {
  const { data, error } = await db.from('aircraft').insert(aircraft).select().single()
  if (error) throw error
  return data
}

export async function updateAircraft(
  db: SupabaseClient<Database>,
  tailNumber: string,
  updates: AircraftUpdate
): Promise<AircraftRow> {
  const { data, error } = await db
    .from('aircraft')
    .update(updates)
    .eq('tail_number', tailNumber)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAircraft(
  db: SupabaseClient<Database>,
  tailNumber: string
): Promise<void> {
  const { error } = await db.from('aircraft').delete().eq('tail_number', tailNumber)
  if (error) throw error
}

export type AircraftPosition = {
  lat: number
  lng: number
  heading: number
  areaId: number | null
}

export async function setAircraftPosition(
  db: SupabaseClient<Database>,
  tailNumber: string,
  { lat, lng, heading, areaId }: AircraftPosition
): Promise<AircraftRow> {
  return updateAircraft(db, tailNumber, {
    parked_lat: lat,
    parked_lng: lng,
    parked_heading: heading,
    parked_area_id: areaId,
    parked_at: new Date().toISOString(),
  })
}

export async function clearAircraftPosition(
  db: SupabaseClient<Database>,
  tailNumber: string
): Promise<AircraftRow> {
  return updateAircraft(db, tailNumber, {
    parked_lat: null,
    parked_lng: null,
    parked_heading: null,
    parked_area_id: null,
    parked_at: null,
  })
}

export async function findParkedAircraft(db: SupabaseClient<Database>): Promise<AircraftRow[]> {
  const { data, error } = await db
    .from('aircraft')
    .select('*')
    .not('parked_lat', 'is', null)
    .order('tail_number')
  if (error) throw error
  return data
}
