import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type TrainingRow = Tables<'training'>
export type TrainingInsert = TablesInsert<'training'>
export type TrainingUpdate = TablesUpdate<'training'>

export async function findAllTrainings(db: SupabaseClient<Database>): Promise<TrainingRow[]> {
  const { data, error } = await db.from('training').select('*').order('training_name')
  if (error) throw error
  return data
}

export async function findTrainingById(
  db: SupabaseClient<Database>,
  id: number
): Promise<TrainingRow | null> {
  const { data, error } = await db
    .from('training')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createTraining(
  db: SupabaseClient<Database>,
  training: TrainingInsert
): Promise<TrainingRow> {
  const { data, error } = await db.from('training').insert(training).select().single()
  if (error) throw error
  return data
}

export async function updateTraining(
  db: SupabaseClient<Database>,
  id: number,
  updates: TrainingUpdate
): Promise<TrainingRow> {
  const { data, error } = await db
    .from('training')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTraining(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('training').delete().eq('id', id)
  if (error) throw error
}
