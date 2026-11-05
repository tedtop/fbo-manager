import { toInstantIso } from '@/lib/local-date'
import type { Database } from '@/types/database'

type BackendFlightStatus =
  Database['public']['Tables']['flight']['Row']['flight_status']

// Shape produced by hooks/use-flights.ts's rowToFlight() adapter over a Supabase flight row
export interface FlightRow {
  id: number | string
  aircraft?: string | null
  aircraft_type_display?: string | null
  call_sign?: string | null
  scheduled_arrival_time?: string | null
  scheduled_departure_time?: string | null
  actual_arrival_time?: string | null
  actual_departure_time?: string | null
  is_quick_turn?: boolean | null
  flight_status?: BackendFlightStatus
  origin?: string | null
  destination?: string | null
  contact_name?: string | null
  contact_notes?: string | null
  services?: string[] | null
  // B26f: key -> quantity for services with a quantity_unit; consumed by use-flights, never sent as a column
  service_quantities?: Record<string, number> | null
  fuel_order_notes?: string | null
  location_id?: number | null
  passenger_count?: number | null
  notes?: string | null
  created_by_source?: string | null
  created_by_initials?: string | null
  created_by_name?: string | null
  created_by_department?: string | null
  created_at: string
  updated_at?: string | null
  hidden_at?: string | null
}

// Component types (from v0)
export type FlightType =
  | 'arrival'
  | 'departure'
  | 'quick_turn'
  | 'overnight'
  | 'long_term'

export type FlightStatus =
  | 'scheduled'
  | 'arrived'
  | 'departed'
  | 'delayed'
  | 'cancelled'

export type FlightSource =
  | 'qt'
  | 'front-desk'
  | 'line-department'
  | 'google-calendar'

// Flight interface - fields ordered to match database schema
export interface Flight {
  // Core identification
  id: string
  tailNumber: string // tail_number (FK to aircraft.tail_number)
  aircraftType: string // derived from aircraft table
  callSign?: string // call_sign

  // Timing (direct from database - no derived fields)
  arrivalTime?: string // scheduled_arrival_time (ISO timestamp; unset for a departure-only / hangar-pull flight)
  departureTime?: string // scheduled_departure_time (ISO timestamp; unset for an arrival-only / return flight)
  actualArrivalTime?: string // actual_arrival_time
  actualDepartureTime?: string // actual_departure_time
  isQuickTurn: boolean // is_quick_turn: departure = arrival + 1 h; shown in both columns

  // Flight details
  type: FlightType // derived from which scheduled times are set and is_quick_turn
  status: FlightStatus // flight_status
  origin?: string // origin
  destination?: string // destination

  // Contact information
  contactName?: string // contact_name
  contactNotes?: string // contact_notes

  // Services and logistics
  services: string[] // services (jsonb)
  serviceQuantities?: Record<string, number> // flight_service.quantity per service key (only services with a unit)
  fuelOrderNotes?: string // fuel_order_notes
  passengers?: number // passenger_count
  notes?: string // notes

  // Location and metadata
  locationId?: number // location_id
  duration: number // calculated from scheduled_arrival_time and scheduled_departure_time (min 45 minutes)

  // Source tracking (always present, defaults to line-department and admin user)
  source: FlightSource // created_by_source (NOT NULL, default: 'line-department')
  createdBy: {
    // derived from created_by_id (NOT NULL, default: 1 = admin)
    initials: string
    name: string
    department: string
  }

  // B43b: hidden once this instant has passed; unset = never hidden (see isFlightHidden in board-logic)
  hiddenAt?: string // hidden_at

  // Timestamps
  createdAt: string // created_at
  updatedAt: string // updated_at
}

export interface FlightFilters {
  search: string
  status: FlightStatus | 'all'
  // today_future: every flight whose stay ends today or later, no upper bound (the default)
  dateRange: 'today' | 'today_future' | 'tomorrow' | 'week' | 'all'
  services: string[]
  // B43b: list hidden flights too (off by default)
  showHidden: boolean
  // Hide the airline flights that come from QT (shown by default; unset = shown)
  hideAirlines?: boolean
}

// Map DB flight_status to component status
function mapFlightStatus(status?: BackendFlightStatus): FlightStatus {
  switch (status) {
    case 'scheduled':
    case 'planned':
      return 'scheduled'
    case 'arrived':
      return 'arrived'
    case 'departed':
      return 'departed'
    case 'delayed':
      return 'delayed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'scheduled'
  }
}

// Map component status back to DB flight_status
export function mapStatusToBackend(status: FlightStatus): BackendFlightStatus {
  switch (status) {
    case 'scheduled':
      return 'scheduled'
    case 'arrived':
      return 'arrived'
    case 'departed':
      return 'departed'
    case 'delayed':
      return 'delayed'
    case 'cancelled':
      return 'cancelled'
  }
}

// Calculate duration in minutes from arrival and departure times
function calculateDuration(
  arrivalTime?: string,
  departureTime?: string
): number {
  if (arrivalTime && departureTime) {
    const arrival = new Date(arrivalTime)
    const departure = new Date(departureTime)
    const durationMs = departure.getTime() - arrival.getTime()
    const durationMinutes = Math.floor(durationMs / (1000 * 60))
    return Math.max(45, durationMinutes) // Minimum 45 minutes
  }
  return 45 // Default 45 minutes for single-time flights
}

// Convert a Supabase flight row (via rowToFlight()) to the component's Flight shape
export function apiFlightToComponentFlight(apiFlight: FlightRow): Flight {
  // Determine flight type based on which times are set
  const hasArrival = !!apiFlight.scheduled_arrival_time
  const hasDeparture = !!apiFlight.scheduled_departure_time

  const isQuickTurn = !!apiFlight.is_quick_turn && hasArrival && hasDeparture

  let type: FlightType
  if (hasArrival && hasDeparture) {
    // Both times: a flagged quick turn, otherwise a longer stay (shown in both columns either way)
    type = isQuickTurn ? 'quick_turn' : 'overnight'
  } else if (hasArrival) {
    type = 'arrival'
  } else {
    type = 'departure'
  }

  // Calculate duration from arrival and departure times
  const duration = calculateDuration(
    apiFlight.scheduled_arrival_time ?? undefined,
    apiFlight.scheduled_departure_time ?? undefined
  )

  // Extract creator info (always present, defaults to admin if not provided)
  const createdByInitials = (apiFlight as any).created_by_initials || 'ADM'
  const createdByName = (apiFlight as any).created_by_name || 'Admin'
  const createdByDept = (apiFlight as any).created_by_department || 'System'

  const createdBy = {
    initials: createdByInitials,
    name: createdByName,
    department: createdByDept
  }

  return {
    id: String(apiFlight.id),
    type,
    tailNumber: apiFlight.aircraft || '',
    aircraftType: (apiFlight as any).aircraft_type_display || '',
    arrivalTime: apiFlight.scheduled_arrival_time ?? undefined,
    departureTime: apiFlight.scheduled_departure_time ?? undefined,
    actualArrivalTime: apiFlight.actual_arrival_time ?? undefined,
    actualDepartureTime: apiFlight.actual_departure_time ?? undefined,
    isQuickTurn,
    // No destination fallback: an arrival's destination is the home airport (B50), not where it came from.
    origin: apiFlight.origin || undefined,
    destination: apiFlight.destination ?? undefined,
    status: mapFlightStatus(apiFlight.flight_status),
    contactName: (apiFlight as any).contact_name || undefined,
    contactNotes: (apiFlight as any).contact_notes || undefined,
    passengers: (apiFlight as any).passenger_count || undefined,
    services: (apiFlight as any).services || [],
    serviceQuantities: apiFlight.service_quantities ?? undefined,
    notes: (apiFlight as any).notes || undefined,
    fuelOrderNotes: apiFlight.fuel_order_notes || undefined,
    locationId: apiFlight.location_id ?? undefined,
    hiddenAt: apiFlight.hidden_at ?? undefined,
    duration, // Calculated from arrival and departure times
    source: ((apiFlight as any).created_by_source as FlightSource) || 'qt',
    createdBy,
    createdAt: apiFlight.created_at,
    updatedAt: (apiFlight as any).updated_at || apiFlight.created_at
  }
}

const TIME_COLUMNS = [
  ['arrivalTime', 'scheduled_arrival_time'],
  ['departureTime', 'scheduled_departure_time'],
  ['actualArrivalTime', 'actual_arrival_time'],
  ['actualDepartureTime', 'actual_departure_time']
] as const
const TIME_COLUMN_NAMES = new Set<string>(TIME_COLUMNS.map(([, c]) => c))

// Convert component flight to backend create/update request
export function componentFlightToApiRequest(
  flight: Partial<Flight>
): Record<string, any> {
  const result: Record<string, any> = {}

  // IMPORTANT: Don't modify flight_number or aircraft on updates
  // Only include these for creates, and use tailNumber as aircraft FK
  if (flight.tailNumber !== undefined) {
    // For backend, aircraft field expects tail_number as FK
    result.aircraft = flight.tailNumber
  }

  if (flight.destination !== undefined) {
    result.destination = flight.destination
  }

  if (flight.origin !== undefined) {
    result.origin = flight.origin
  }

  // Times are sent as UTC instants (offset-less local strings are converted). A time key that is present but unset means "cleared" and is sent as
  // null (e.g. the form blanking the departure); a key that is absent is left alone.
  for (const [key, column] of TIME_COLUMNS) {
    if (key in flight) {
      const value = flight[key]
      result[column] = value ? toInstantIso(value) : null
    }
  }

  if (flight.isQuickTurn !== undefined) {
    result.is_quick_turn = flight.isQuickTurn
  }

  if (flight.status !== undefined) {
    result.flight_status = mapStatusToBackend(flight.status)
  }

  if (flight.contactName !== undefined) {
    result.contact_name = flight.contactName
  }

  if (flight.contactNotes !== undefined) {
    result.contact_notes = flight.contactNotes
  }

  if (flight.passengers !== undefined) {
    result.passenger_count = flight.passengers
  }

  if (flight.services !== undefined) {
    result.services = flight.services
  }

  if (flight.serviceQuantities !== undefined) {
    result.service_quantities = flight.serviceQuantities
  }

  if (flight.notes !== undefined) {
    result.notes = flight.notes
  }

  if (flight.fuelOrderNotes !== undefined) {
    result.fuel_order_notes = flight.fuelOrderNotes
  }

  if (flight.locationId !== undefined) {
    result.location_id = flight.locationId
  }

  if (flight.source !== undefined) {
    result.created_by_source = flight.source
  }

  // hidden_at is deliberately not mapped: a general edit spreads the whole Flight, and must never write the
  // hide flag. Hide/Unhide and the Departed auto-hide go through setFlightHidden / updateFlight in the repo.
  // call_sign is intentionally never generated: the aircraft is identified by its tail number
  // (tail_number). A call sign is only stored when staff enter one for a flight that uses one.
  // Filter out any undefined/null values (except cleared times)
  Object.keys(result).forEach((key) => {
    if (TIME_COLUMN_NAMES.has(key)) return
    if (result[key] === undefined || result[key] === null) {
      delete result[key]
    }
  })

  return result
}
