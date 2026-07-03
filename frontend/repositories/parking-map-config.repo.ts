import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert } from '@/types/database'

export type ParkingMapConfigRow = Tables<'parking_map_configurations'>
export type ParkingMapConfigInsert = TablesInsert<'parking_map_configurations'>

/**
 * Load the map config for an airport.
 * Returns the user-specific config if userId is provided and one exists,
 * otherwise falls back to the airport-wide default (user_id = null).
 */
export async function getParkingMapConfig(
  db: SupabaseClient<Database>,
  airport: string,
  userId?: number
): Promise<ParkingMapConfigRow | null> {
  if (userId !== undefined) {
    const { data } = await db
      .from('parking_map_configurations')
      .select('*')
      .eq('airport', airport)
      .eq('user_id', userId)
      .maybeSingle()
    if (data) return data
  }

  const { data } = await db
    .from('parking_map_configurations')
    .select('*')
    .eq('airport', airport)
    .is('user_id', null)
    .maybeSingle()

  return data ?? null
}

/**
 * Save (insert or update) a map config.
 * Conflicts on (airport, user_id) are resolved by updating in place.
 */
export async function upsertParkingMapConfig(
  db: SupabaseClient<Database>,
  config: ParkingMapConfigInsert
): Promise<ParkingMapConfigRow> {
  const { data, error } = await db
    .from('parking_map_configurations')
    .upsert(
      { ...config, updated_at: new Date().toISOString() },
      { onConflict: 'airport,user_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
