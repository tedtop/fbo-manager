import { ConcurrencyConflictError } from '@/lib/concurrency'
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TankRow = Tables<'fuel_tank'>
export type TankInsert = TablesInsert<'fuel_tank'>
export type TankUpdate = TablesUpdate<'fuel_tank'>

export type TankWithLatestReading = TankRow & {
  latest_reading: { level: string; recorded_at: string } | null
}

export async function findAllTanks(
  db: SupabaseClient<Database>
): Promise<TankWithLatestReading[]> {
  const { data: tanks, error } = await db
    .from('fuel_tank')
    .select('*')
    .order('tank_id')
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
  const { data, error } = await db
    .from('fuel_tank')
    .insert(tank)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Update a tank. When `expectedModifiedAt` is provided, the write is an
 * atomic compare-and-swap: it only applies if the row's `modified_at` still
 * matches what the caller loaded. If someone else saved a change in between,
 * zero rows match and this throws ConcurrencyConflictError instead of
 * silently overwriting their edit. Omit `expectedModifiedAt` to write
 * unconditionally (e.g. the "overwrite anyway" path).
 */
export async function updateTank(
  db: SupabaseClient<Database>,
  tankId: string,
  updates: TankUpdate,
  expectedModifiedAt?: string
): Promise<TankRow> {
  let query = db.from('fuel_tank').update(updates).eq('tank_id', tankId)
  if (expectedModifiedAt) {
    query = query.eq('modified_at', expectedModifiedAt)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (expectedModifiedAt && error.code === 'PGRST116') {
      throw new ConcurrencyConflictError('fuel_tank', tankId)
    }
    throw error
  }
  return data
}

export async function deleteTank(
  db: SupabaseClient<Database>,
  tankId: string
): Promise<void> {
  const { error } = await db.from('fuel_tank').delete().eq('tank_id', tankId)
  if (error) throw error
}
