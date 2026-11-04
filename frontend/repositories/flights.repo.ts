import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { formatLocalDate, localDayStartIso, localNextDayStartIso } from '@/lib/local-date'

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
  aircraft:tail_number ( tail_number, aircraft_type_icao, aircraft_type_display ),
  location:location_id ( location_code, description, latitude, longitude ),
  created_by:created_by_id ( id, first_name, last_name, username, role )
`

export interface FlightFilters {
  startDate?: string
  endDate?: string
  today?: boolean
  status?: string
  // B43b: also return hidden flights (off by default).
  includeHidden?: boolean
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

  // Range bounds are local calendar days converted to UTC instants: [local 00:00 of start, local 00:00 of
  // the day after end). B43 overlap rule: a flight matches when its stay overlaps the range, i.e. scheduled
  // arrival < rangeEnd AND (no departure OR departure >= rangeStart). A departure-only flight matches on its
  // departure day only. A plane that arrived before the range is therefore still returned. With only a
  // startDate (no endDate) the range has no upper bound: "Today + Future" = every flight whose stay ends on
  // or after that day. flightInRange in components/flight-operations/board-logic.ts applies the same rule.
  let rangeStart: string | undefined
  let rangeEnd: string | undefined
  if (filters?.today) {
    const today = formatLocalDate(new Date())
    rangeStart = localDayStartIso(today)
    rangeEnd = localNextDayStartIso(today)
  } else {
    if (filters?.startDate) rangeStart = localDayStartIso(filters.startDate)
    if (filters?.endDate) rangeEnd = localNextDayStartIso(filters.endDate)
  }
  if (rangeStart || rangeEnd) {
    const ARR = 'scheduled_arrival_time'
    const DEP = 'scheduled_departure_time'
    const stay = [
      rangeEnd ? `${ARR}.lt.${rangeEnd}` : `${ARR}.not.is.null`,
      rangeStart ? `or(${DEP}.is.null,${DEP}.gte.${rangeStart})` : undefined
    ].filter(Boolean)
    const departureOnly = [
      `${ARR}.is.null`,
      rangeStart ? `${DEP}.gte.${rangeStart}` : undefined,
      rangeEnd ? `${DEP}.lt.${rangeEnd}` : undefined
    ].filter(Boolean)
    query = query.or(`and(${stay.join(',')}),and(${departureOnly.join(',')})`)
  }

  // B43b: a flight is hidden once its hidden_at has passed (a future hidden_at, set when a flight departs,
  // keeps it visible until the day after). Same test as isFlightHidden in board-logic. A second `or` is
  // ANDed with the range filter above.
  if (!filters?.includeHidden) {
    query = query.or(`hidden_at.is.null,hidden_at.gt.${new Date().toISOString()}`)
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

// B43b / D13: setting a flight to Departed hides it from the start of the day after its departure day (board
// time zone), so it stays on the board for the departure day. The instant is stored in hidden_at, the same
// column the Hide button writes (now()), so the board has one hidden test (see isFlightHidden in board-logic).
// This returns the hidden_at to send together with a status change (undefined = leave it alone):
//  - to Departed, not hidden yet: the start of the day after the actual departure day (else today); a flight
//    already hidden by hand keeps its earlier hidden_at.
//  - away from Departed (a status correction): null, so the flight is back on the board.
// It is a pure function over the flight's current values (the hook takes them from the cached board, so a save
// needs no extra read); updateFlight itself writes exactly what it is given.
export function hiddenAtForStatusChange(
  current: Pick<FlightRow, 'flight_status' | 'hidden_at' | 'actual_departure_time'>,
  nextStatus: FlightRow['flight_status'],
  nextActualDeparture: string | null | undefined,
  now: Date = new Date()
): string | null | undefined {
  if (current.flight_status === nextStatus) return undefined
  if (nextStatus === 'departed') {
    if (current.hidden_at) return undefined
    // undefined = the save does not touch the actual departure; null = it clears it (then today counts)
    const departure = nextActualDeparture === undefined ? current.actual_departure_time : nextActualDeparture
    return localNextDayStartIso(formatLocalDate(departure ? new Date(departure) : now))
  }
  return current.flight_status === 'departed' ? null : undefined
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

// Hide button / Unhide: hidden_at = now() hides the flight immediately, null brings it back.
export function setFlightHidden(
  db: SupabaseClient<Database>,
  id: number,
  hidden: boolean,
  expectedModifiedAt?: string
): Promise<FlightWithRelations> {
  return updateFlight(db, id, { hidden_at: hidden ? new Date().toISOString() : null }, expectedModifiedAt)
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
