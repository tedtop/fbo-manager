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
  updates: TrainingCourseUpdate
): Promise<TrainingCourseRow> {
  const { data, error } = await db
    .from('training_course')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCourse(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('training_course').delete().eq('id', id)
  if (error) throw error
}
