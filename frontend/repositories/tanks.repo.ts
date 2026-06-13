import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type TankRow = Tables<'fuel_tank'>
export type TankInsert = TablesInsert<'fuel_tank'>
export type TankUpdate = TablesUpdate<'fuel_tank'>

export type TankWithLatestReading = TankRow & {
  latest_reading: { level: string; recorded_at: string } | null
}

export async function findAllTanks(db: SupabaseClient<Database>): Promise<TankWithLatestReading[]> {
  const { data: tanks, error } = await db.from('fuel_tank').select('*').order('tank_id')
  if (error) throw error

  // Fetch latest reading per tank
  const results: TankWithLatestReading[] = await Promise.all(
    tanks.map(async (tank) => {
      const { data: reading } = await db
        .from('tank_level_readings')
        .select('level, recorded_at')
        .eq('tank_id', tank.tank_id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()
      return { ...tank, latest_reading: reading ?? null }
    })
  )

  return results
}

export async function findTankById(
  db: SupabaseClient<Database>,
  tankId: string
): Promise<TankRow | null> {
  const { data, error } = await db
    .from('fuel_tank')
    .select('*')
    .eq('tank_id', tankId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createTank(
  db: SupabaseClient<Database>,
  tank: TankInsert
): Promise<TankRow> {
  const { data, error } = await db.from('fuel_tank').insert(tank).select().single()
  if (error) throw error
  return data
}

export async function updateTank(
  db: SupabaseClient<Database>,
  tankId: string,
  updates: TankUpdate
): Promise<TankRow> {
  const { data, error } = await db
    .from('fuel_tank')
    .update(updates)
    .eq('tank_id', tankId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTank(
  db: SupabaseClient<Database>,
  tankId: string
): Promise<void> {
  const { error } = await db.from('fuel_tank').delete().eq('tank_id', tankId)
  if (error) throw error
}
