import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type ParkingAreaRow = Tables<'parking_area'>
export type ParkingAreaInsert = TablesInsert<'parking_area'>
export type ParkingAreaUpdate = TablesUpdate<'parking_area'>

export async function findAllParkingAreas(
  db: SupabaseClient<Database>,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Promise<ParkingAreaRow[]> {
  let query = db
    .from('parking_area')
    .select('*')
    .order('display_order')
    .order('code')
  if (!includeInactive) {
    query = query.eq('is_active', true)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function findParkingAreaById(
  db: SupabaseClient<Database>,
  id: number
): Promise<ParkingAreaRow | null> {
  const { data, error } = await db.from('parking_area').select('*').eq('id', id).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createParkingArea(
  db: SupabaseClient<Database>,
  area: ParkingAreaInsert
): Promise<ParkingAreaRow> {
  const { data, error } = await db.from('parking_area').insert(area).select().single()
  if (error) throw error
  return data
}

export async function updateParkingArea(
  db: SupabaseClient<Database>,
  id: number,
  updates: ParkingAreaUpdate
): Promise<ParkingAreaRow> {
  const { data, error } = await db
    .from('parking_area')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveParkingArea(db: SupabaseClient<Database>, id: number): Promise<void> {
  const { error } = await db.from('parking_area').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

export async function deleteParkingArea(db: SupabaseClient<Database>, id: number): Promise<void> {
  const { error } = await db.from('parking_area').delete().eq('id', id)
  if (error) throw error
}
