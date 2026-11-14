import { ConcurrencyConflictError } from '@/lib/concurrency'
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TrainingCourseRow = Tables<'training_course'>
export type TrainingCourseInsert = TablesInsert<'training_course'>
export type TrainingCourseUpdate = TablesUpdate<'training_course'>
export type ValidityUnit = NonNullable<TrainingCourseRow['validity_unit']>

export async function findAllCourses(
  db: SupabaseClient<Database>,
  opts?: { includeInactive?: boolean }
): Promise<TrainingCourseRow[]> {
  let query = db
    .from('training_course')
    .select('*')
    .order('display_order')
    .order('name')
  if (!opts?.includeInactive) {
    query = query.eq('is_active', true)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createCourse(
  db: SupabaseClient<Database>,
  course: TrainingCourseInsert
): Promise<TrainingCourseRow> {
  const { data, error } = await db
    .from('training_course')
    .insert(course)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCourse(
  db: SupabaseClient<Database>,
  id: number,
  updates: TrainingCourseUpdate,
  expectedUpdatedAt?: string
): Promise<TrainingCourseRow> {
  // The set_updated_at trigger overrides updated_at; it is also sent here so the column moves even if the trigger is missing.
  let query = db
    .from('training_course')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (expectedUpdatedAt && error.code === 'PGRST116') {
      throw new ConcurrencyConflictError('training_course', id)
    }
    throw error
  }
  return data
}

export async function deleteCourse(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('training_course').delete().eq('id', id)
  if (error) throw error
}
