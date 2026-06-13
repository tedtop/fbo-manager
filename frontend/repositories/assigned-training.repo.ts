import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type AssignedTrainingRow = Tables<'assigned_training'>
export type AssignedTrainingInsert = TablesInsert<'assigned_training'>
export type AssignedTrainingUpdate = TablesUpdate<'assigned_training'>

export async function findAssignedTrainingByFuelerId(
  db: SupabaseClient<Database>,
  fuelerId: number
): Promise<AssignedTrainingRow[]> {
  const { data, error } = await db
    .from('assigned_training')
    .select('*, training:training_id ( id, training_name, description )')
    .eq('fueler_id', fuelerId)
    .eq('status', 'assigned')
    .order('assigned_at', { ascending: false })
  if (error) throw error
  return data as AssignedTrainingRow[]
}

export async function createAssignedTraining(
  db: SupabaseClient<Database>,
  entry: AssignedTrainingInsert
): Promise<AssignedTrainingRow> {
  const { data, error } = await db
    .from('assigned_training')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAssignedTraining(
  db: SupabaseClient<Database>,
  id: number,
  updates: AssignedTrainingUpdate
): Promise<AssignedTrainingRow> {
  const { data, error } = await db
    .from('assigned_training')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
