import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'
import { lowestReading, type MeasuredLow } from '@/lib/fuel-farm'

export type TankLevelOverrideRow = Tables<'fuel_tank_level_override'>

/** Lowest reading ever saved for a tank, read from tank_level_readings (Minuteman-owned: read only). */
export async function findLowestMeasured(
  db: SupabaseClient<Database>,
  tankId: string
): Promise<MeasuredLow | null> {
  const { data, error } = await db
    .from('tank_level_readings')
    .select('level, recorded_at')
    .eq('tank_id', tankId)
    .order('level', { ascending: true })
    .order('recorded_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return lowestReading((data ?? []).map((r) => ({ level: r.level, recordedAt: r.recorded_at })))
}

export async function findLevelOverride(
  db: SupabaseClient<Database>,
  tankId: string
): Promise<TankLevelOverrideRow | null> {
  const { data, error } = await db
    .from('fuel_tank_level_override')
    .select('*')
    .eq('tank_id', tankId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Sets the override for a tank (insert or replace). set_by / set_at are stamped by a database trigger. */
export async function setLevelOverride(
  db: SupabaseClient<Database>,
  tankId: string,
  lowestLevelInches: number,
  note?: string | null
): Promise<TankLevelOverrideRow> {
  const { data, error } = await db
    .from('fuel_tank_level_override')
    .upsert(
      { tank_id: tankId, lowest_level_inches: lowestLevelInches, note: note ?? null },
      { onConflict: 'tank_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

/** Removes the override so the measured lowest level applies again. No-op when none exists. */
export async function clearLevelOverride(db: SupabaseClient<Database>, tankId: string): Promise<void> {
  const { error } = await db.from('fuel_tank_level_override').delete().eq('tank_id', tankId)
  if (error) throw error
}
