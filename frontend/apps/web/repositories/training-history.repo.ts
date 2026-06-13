import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert } from '@/types/database'

export type TrainingHistoryRow = Tables<'fueler_training_history'>
export type TrainingHistoryInsert = TablesInsert<'fueler_training_history'>

export async function findHistoryByFuelerId(
  db: SupabaseClient<Database>,
  fuelerId: number
): Promise<TrainingHistoryRow[]> {
  const { data, error } = await db
    .from('fueler_training_history')
    .select('*')
    .eq('fueler_id', fuelerId)
    .order('completed_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createTrainingHistory(
  db: SupabaseClient<Database>,
  entry: TrainingHistoryInsert
): Promise<TrainingHistoryRow> {
  const { data, error } = await db
    .from('fueler_training_history')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data
}
