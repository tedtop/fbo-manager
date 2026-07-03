import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type ShiftRow = Tables<'staff_shift'>
export type ShiftInsert = TablesInsert<'staff_shift'>
export type ShiftUpdate = TablesUpdate<'staff_shift'>

export type ShiftWithFueler = ShiftRow & {
  fueler: { id: number; fueler_name: string } | null
}

const SHIFT_SELECT = `*, fueler:fueler_id ( id, fueler_name )`

export async function findShiftsByDateRange(
  db: SupabaseClient<Database>,
  startDate: string,
  endDate: string
): Promise<ShiftWithFueler[]> {
  const { data, error } = await db
    .from('staff_shift')
    .select(SHIFT_SELECT)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)
    .order('shift_date')
    .order('start_time')
  if (error) throw error
  return data as ShiftWithFueler[]
}

export async function createShift(
  db: SupabaseClient<Database>,
  shift: ShiftInsert
): Promise<ShiftRow> {
  const { data, error } = await db
    .from('staff_shift')
    .insert(shift)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateShift(
  db: SupabaseClient<Database>,
  id: number,
  updates: ShiftUpdate
): Promise<ShiftRow> {
  const { data, error } = await db
    .from('staff_shift')
    .update(updates)
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
  const { error } = await db.from('staff_shift').delete().eq('id', id)
  if (error) throw error
}
