import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type ScheduleShiftRow = Tables<'schedule_shift'>
export type ScheduleShiftInsert = TablesInsert<'schedule_shift'>
export type ScheduleShiftUpdate = TablesUpdate<'schedule_shift'>

/**
 * Fetch shifts for a department within [startDate, endDate] (inclusive).
 * Callers should extend startDate one day back to catch overnight spillover.
 */
export async function findShiftsByRange(
  db: SupabaseClient<Database>,
  departmentId: number,
  startDate: string,
  endDate: string
): Promise<ScheduleShiftRow[]> {
  const { data, error } = await db
    .from('schedule_shift')
    .select('*')
    .eq('department_id', departmentId)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)
    .order('shift_date')
    .order('start_time')
  if (error) throw error
  return data
}

export async function createShift(
  db: SupabaseClient<Database>,
  shift: ScheduleShiftInsert
): Promise<ScheduleShiftRow> {
  const { data, error } = await db
    .from('schedule_shift')
    .insert(shift)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateShift(
  db: SupabaseClient<Database>,
  id: number,
  updates: ScheduleShiftUpdate
): Promise<ScheduleShiftRow> {
  const { data, error } = await db
    .from('schedule_shift')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteShift(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('schedule_shift').delete().eq('id', id)
  if (error) throw error
}
