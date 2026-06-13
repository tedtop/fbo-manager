import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert } from '@/types/database'

export type TankReadingRow = Tables<'tank_level_readings'>
export type TankReadingInsert = TablesInsert<'tank_level_readings'>

export async function findReadingsByTankId(
  db: SupabaseClient<Database>,
  tankId: string,
  days = 7
): Promise<TankReadingRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await db
    .from('tank_level_readings')
    .select('*')
    .eq('tank_id', tankId)
    .gte('recorded_at', since.toISOString())
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createTankReading(
  db: SupabaseClient<Database>,
  reading: TankReadingInsert
): Promise<TankReadingRow> {
  const { data, error } = await db
    .from('tank_level_readings')
    .insert(reading)
    .select()
    .single()
  if (error) throw error
  return data
}
