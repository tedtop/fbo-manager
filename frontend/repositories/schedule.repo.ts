import { ConcurrencyConflictError } from '@/lib/concurrency'
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
  updates: ScheduleShiftUpdate,
  expectedUpdatedAt?: string
): Promise<ScheduleShiftRow> {
  // The set_updated_at trigger overrides updated_at; it is also sent here so the column moves even if the trigger is missing.
  let query = db
    .from('schedule_shift')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (expectedUpdatedAt && error.code === 'PGRST116') {
      throw new ConcurrencyConflictError('schedule_shift', id)
    }
    throw error
  }
  return data
}

export async function deleteShift(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('schedule_shift').delete().eq('id', id)
  if (error) throw error
}
