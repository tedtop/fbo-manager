import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type ParkingLocationRow = Tables<'parking_location'>
export type ParkingLocationInsert = TablesInsert<'parking_location'>
export type ParkingLocationUpdate = TablesUpdate<'parking_location'>

export async function findAllParkingLocations(
  db: SupabaseClient<Database>,
  activeOnly = true
): Promise<ParkingLocationRow[]> {
  let query = db.from('parking_location').select('*').order('display_order', { ascending: false })
  if (activeOnly) {
    query = query.gt('display_order', 0)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function findParkingLocationById(
  db: SupabaseClient<Database>,
  id: number
): Promise<ParkingLocationRow | null> {
  const { data, error } = await db
    .from('parking_location')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createParkingLocation(
  db: SupabaseClient<Database>,
  location: ParkingLocationInsert
): Promise<ParkingLocationRow> {
  const { data, error } = await db.from('parking_location').insert(location).select().single()
  if (error) throw error
  return data
}

export async function updateParkingLocation(
  db: SupabaseClient<Database>,
  id: number,
  updates: ParkingLocationUpdate
): Promise<ParkingLocationRow> {
  const { data, error } = await db
    .from('parking_location')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteParkingLocation(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db
    .from('parking_location')
    .update({ display_order: 0 })
    .eq('id', id)
  if (error) throw error
}
