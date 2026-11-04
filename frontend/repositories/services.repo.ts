import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'

export type ServiceRow = Tables<'service'>

// The board vocabulary only: billable-but-not-on-board items live in `product` and never appear here.
// Inactive (retired) services are not returned, so they cannot be picked or filtered on.
export async function findActiveServices(
  db: SupabaseClient<Database>
): Promise<ServiceRow[]> {
  const { data, error } = await db
    .from('service')
    .select('*')
    .eq('active', true)
    .order('sort_order')
    .order('key')
  if (error) throw error
  return data
}

// Replaces the flight's services with `keys` in one transaction (RPC set_flight_services). Unknown or
// inactive keys raise. Idempotent, so a failed save can be retried. Bumps flight.updated_at (and
// keeps the legacy flight.services column in sync until B26e), so callers re-read the flight after it.
// Returns the stored keys in catalog order.
export async function setFlightServices(
  db: SupabaseClient<Database>,
  flightId: number,
  keys: string[]
): Promise<string[]> {
  const { data, error } = await db.rpc('set_flight_services', {
    p_flight_id: flightId,
    p_services: [...new Set(keys)]
  })
  if (error) throw error
  return data ?? []
}
