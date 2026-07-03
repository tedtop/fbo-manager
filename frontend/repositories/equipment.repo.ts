import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type EquipmentRow = Tables<'equipment'>
export type EquipmentInsert = TablesInsert<'equipment'>
export type EquipmentUpdate = TablesUpdate<'equipment'>

export type EquipmentWithFueler = EquipmentRow & {
  fueler: { id: number; fueler_name: string } | null
}

export async function findAllEquipment(db: SupabaseClient<Database>): Promise<EquipmentWithFueler[]> {
  const { data, error } = await db
    .from('equipment')
    .select('*, fueler:assigned_fueler_id(id, fueler_name)')
    .order('equipment_name')
  if (error) throw error
  return data as EquipmentWithFueler[]
}

export async function findEquipmentById(
  db: SupabaseClient<Database>,
  id: number
): Promise<EquipmentRow | null> {
  const { data, error } = await db
    .from('equipment')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createEquipment(
  db: SupabaseClient<Database>,
  equipment: EquipmentInsert
): Promise<EquipmentRow> {
  const { data, error } = await db.from('equipment').insert(equipment).select().single()
  if (error) throw error
  return data
}

export async function updateEquipment(
  db: SupabaseClient<Database>,
  id: number,
  updates: EquipmentUpdate
): Promise<EquipmentRow> {
  const { data, error } = await db
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEquipment(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('equipment').delete().eq('id', id)
  if (error) throw error
}
