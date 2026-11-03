import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { ConcurrencyConflictError } from '@/lib/concurrency'

export type FlightRow = Tables<'flight'>
export type FlightInsert = TablesInsert<'flight'>
export type FlightUpdate = TablesUpdate<'flight'>

export type FlightWithRelations = FlightRow & {
  aircraft: { tail_number: string; aircraft_type_icao: string; aircraft_type_display: string } | null
  location: { location_code: string | null; description: string; latitude: string | null; longitude: string | null } | null
  created_by: {
    id: number
    first_name: string
    last_name: string
    username: string
    role: string
  } | null
}

const FLIGHT_SELECT = `
  *,
  aircraft:aircraft_id ( tail_number, aircraft_type_icao, aircraft_type_display ),
  location:location_id ( location_code, description, latitude, longitude ),
  created_by:created_by_id ( id, first_name, last_name, username, role )
`

export interface FlightFilters {
  startDate?: string
  endDate?: string
  today?: boolean
  status?: string
}

export async function findAllFlights(
  db: SupabaseClient<Database>,
  filters?: FlightFilters
): Promise<FlightWithRelations[]> {
  let query = db
    .from('flight')
    .select(FLIGHT_SELECT)
    .is('deleted_at', null)
    .order('scheduled_departure_time', { ascending: false })

  if (filters?.today) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    query = query
      .gte('scheduled_departure_time', start.toISOString())
      .lte('scheduled_departure_time', end.toISOString())
  } else {
    if (filters?.startDate) {
      query = query.gte('scheduled_departure_time', filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte('scheduled_departure_time', `${filters.endDate}T23:59:59`)
    }
  }

  if (filters?.status) {
    query = query.eq('flight_status', filters.status as Database['public']['Tables']['flight']['Row']['flight_status'])
  }

  const { data, error } = await query
  if (error) throw error
  return data as FlightWithRelations[]
}

export async function findFlightById(
  db: SupabaseClient<Database>,
  id: number
): Promise<FlightWithRelations | null> {
  const { data, error } = await db
    .from('flight')
    .select(FLIGHT_SELECT)
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as FlightWithRelations | null
}

export async function createFlight(
  db: SupabaseClient<Database>,
  flight: FlightInsert
): Promise<FlightWithRelations> {
  const { data, error } = await db
    .from('flight')
    .insert(flight)
    .select(FLIGHT_SELECT)
    .single()
  if (error) throw error
  return data as FlightWithRelations
}

export async function updateFlight(
  db: SupabaseClient<Database>,
  id: number,
  updates: FlightUpdate,
  expectedModifiedAt?: string
): Promise<FlightWithRelations> {
  let query = db.from('flight').update(updates).eq('id', id)
  if (expectedModifiedAt) {
    query = query.eq('modified_at', expectedModifiedAt)
  }
  const { data, error } = await query.select(FLIGHT_SELECT).single()
  if (error) {
    if (expectedModifiedAt && error.code === 'PGRST116') {
      throw new ConcurrencyConflictError('flight', id)
    }
    throw error
  }
  return data as FlightWithRelations
}

// Soft delete: the row stays in the table with `deleted_at` set so it can be looked up later.
export async function deleteFlight(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db
    .from('flight')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
