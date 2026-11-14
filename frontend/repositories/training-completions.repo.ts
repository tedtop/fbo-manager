import { isMissingProfileAttributionColumn } from '@/lib/completion-recorder'
import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TrainingCompletionRow = Tables<'training_completion'>
export type TrainingCompletionInsert = TablesInsert<'training_completion'>

export type TrainingCompletionWithRecorder = TrainingCompletionRow & {
  /** Legacy `users` recorder: only completions recorded before B141 (or by an account that has a legacy row). */
  recorded_by: {
    id: number
    first_name: string
    last_name: string
    username: string
  } | null
  /** The recorder's profile (B141); null on completions recorded before it existed. */
  recorded_by_profile: {
    id: string
    first_name: string
    last_name: string
  } | null
}

const LEGACY_SELECT = `
  *,
  recorded_by:recorded_by_id ( id, first_name, last_name, username )
`
const COMPLETION_SELECT = `
  *,
  recorded_by:recorded_by_id ( id, first_name, last_name, username ),
  recorded_by_profile:recorded_by_profile_id ( id, first_name, last_name )
`

/**
 * All completion events, newest first. The matrix reduces this to the
 * latest completion per (user, course); older rows are renewal history.
 */
export async function findAllCompletions(
  db: SupabaseClient<Database>
): Promise<TrainingCompletionWithRecorder[]> {
  const read = (select: string) =>
    db
      .from('training_completion')
      .select(select)
      .order('completed_on', { ascending: false })
      .order('id', { ascending: false })
  let { data, error } = await read(COMPLETION_SELECT)
  // Before the B141 migration is applied the profile column does not exist: read without it.
  if (error && isMissingProfileAttributionColumn(error)) {
    ;({ data, error } = await read(LEGACY_SELECT))
  }
  if (error) throw error
  return (data as unknown as TrainingCompletionWithRecorder[]).map((c) => ({
    ...c,
    recorded_by_profile: c.recorded_by_profile ?? null
  }))
}

export async function createCompletion(
  db: SupabaseClient<Database>,
  completion: TrainingCompletionInsert
): Promise<TrainingCompletionRow> {
  let { data, error } = await db
    .from('training_completion')
    .insert(completion)
    .select()
    .single()
  if (error && isMissingProfileAttributionColumn(error)) {
    // B141 migration not applied yet: record without the profile attribution.
    const { recorded_by_profile_id: dropped, ...legacy } = completion
    void dropped
    ;({ data, error } = await db
      .from('training_completion')
      .insert(legacy)
      .select()
      .single())
  }
  if (error) throw error
  return data as TrainingCompletionRow
}

export async function deleteCompletion(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('training_completion').delete().eq('id', id)
  if (error) throw error
}
