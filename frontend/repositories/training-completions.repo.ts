import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TrainingCompletionRow = Tables<'training_completion'>
export type TrainingCompletionInsert = TablesInsert<'training_completion'>

export type TrainingCompletionWithRecorder = TrainingCompletionRow & {
  recorded_by: {
    id: number
    first_name: string
    last_name: string
    username: string
  } | null
}

const COMPLETION_SELECT = `
  *,
  recorded_by:recorded_by_id ( id, first_name, last_name, username )
`

/**
 * All completion events, newest first. The matrix reduces this to the
 * latest completion per (user, course); older rows are renewal history.
 */
export async function findAllCompletions(
  db: SupabaseClient<Database>
): Promise<TrainingCompletionWithRecorder[]> {
  const { data, error } = await db
    .from('training_completion')
    .select(COMPLETION_SELECT)
    .order('completed_on', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data as unknown as TrainingCompletionWithRecorder[]
}

export async function createCompletion(
  db: SupabaseClient<Database>,
  completion: TrainingCompletionInsert
): Promise<TrainingCompletionRow> {
  const { data, error } = await db
    .from('training_completion')
    .insert(completion)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCompletion(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('training_completion').delete().eq('id', id)
  if (error) throw error
}
