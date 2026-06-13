import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type FlightRow = Tables<'flight'>
export type FlightInsert = TablesInsert<'flight'>
export type FlightUpdate = TablesUpdate<'flight'>

export type FlightWithRelations = FlightRow & {
  aircraft: { tail_number: string; aircraft_type_display: string } | null
  location: { location_code: string | null; description: string } | null
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
  aircraft:aircraft_id ( tail_number, aircraft_type_display ),
  location:location_id ( location_code, description ),
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
    .order('departure_time', { ascending: false })

  if (filters?.today) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    query = query
      .gte('departure_time', start.toISOString())
      .lte('departure_time', end.toISOString())
  } else {
    if (filters?.startDate) {
      query = query.gte('departure_time', filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte('departure_time', `${filters.endDate}T23:59:59`)
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
  updates: FlightUpdate
): Promise<FlightWithRelations> {
  const { data, error } = await db
    .from('flight')
    .update(updates)
    .eq('id', id)
    .select(FLIGHT_SELECT)
    .single()
  if (error) throw error
  return data as FlightWithRelations
}

export async function deleteFlight(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('flight').delete().eq('id', id)
  if (error) throw error
}
