import type { Database } from '@/types/database'

type BackendFlightStatus =
  Database['public']['Tables']['flight']['Row']['flight_status']

// Shape produced by hooks/use-flights.ts's rowToFlight() adapter over a Supabase flight row
export interface FlightRow {
  id: number | string
  aircraft?: string | null
  aircraft_type_display?: string | null
  call_sign?: string | null
  arrival_time?: string | null
  departure_time?: string | null
  flight_status?: BackendFlightStatus
  origin?: string | null
  destination?: string | null
  contact_name?: string | null
  contact_notes?: string | null
  services?: string[] | null
  fuel_order_notes?: string | null
  passenger_count?: number | null
  notes?: string | null
  created_by_source?: string | null
  created_by_initials?: string | null
  created_by_name?: string | null
  created_by_department?: string | null
  created_at: string
  modified_at?: string | null
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
  | 'en-route'
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
  tailNumber: string // aircraft_id (FK to aircraft.tail_number)
  aircraftType: string // derived from aircraft table
  callSign?: string // call_sign

  // Timing (direct from database - no derived fields)
  arrivalTime?: string // arrival_time (ISO timestamp)
  departureTime: string // departure_time (ISO timestamp, NOT NULL)

  // Flight details
  type: FlightType // derived from arrival_time and departure_time presence
  status: FlightStatus // flight_status
  origin?: string // origin
  destination?: string // destination

  // Contact information
  contactName?: string // contact_name
  contactNotes?: string // contact_notes

  // Services and logistics
  services: string[] // services (jsonb)
  fuelOrderNotes?: string // fuel_order_notes
  passengers?: number // passenger_count
  notes?: string // notes

  // Location and metadata
  locationId?: number // location_id
  duration: number // calculated from arrival_time and departure_time (min 45 minutes)

  // Source tracking (always present, defaults to line-department and admin user)
  source: FlightSource // created_by_source (NOT NULL, default: 'line-department')
  createdBy: {
    // derived from created_by_id (NOT NULL, default: 1 = admin)
    initials: string
    name: string
    department: string
  }

  // Timestamps
  createdAt: string // created_at
  updatedAt: string // modified_at
}

export interface FlightFilters {
  search: string
  status: FlightStatus | 'all'
  dateRange: 'today' | 'tomorrow' | 'week' | 'all'
  services: string[]
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
    case 'en-route':
      return 'scheduled' // DB doesn't have en-route, use scheduled
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
  const hasArrival = !!apiFlight.arrival_time
  const hasDeparture = !!apiFlight.departure_time

  let type: FlightType
  if (hasArrival && hasDeparture) {
    // Has both times - it's a quick turn
    type = 'quick_turn'
  } else if (hasArrival) {
    type = 'arrival'
  } else {
    type = 'departure'
  }

  // Calculate duration from arrival and departure times
  const duration = calculateDuration(
    apiFlight.arrival_time ?? undefined,
    apiFlight.departure_time ?? undefined
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
    arrivalTime: apiFlight.arrival_time ?? undefined,
    departureTime: apiFlight.departure_time!,
    origin:
      apiFlight.origin ||
      (hasArrival ? apiFlight.destination : undefined) ||
      undefined,
    destination: apiFlight.destination ?? undefined,
    status: mapFlightStatus(apiFlight.flight_status),
    contactName: (apiFlight as any).contact_name || undefined,
    contactNotes: (apiFlight as any).contact_notes || undefined,
    passengers: (apiFlight as any).passenger_count || undefined,
    services: (apiFlight as any).services || [],
    notes: (apiFlight as any).notes || undefined,
    duration, // Calculated from arrival and departure times
    source: ((apiFlight as any).created_by_source as FlightSource) || 'qt',
    createdBy,
    createdAt: apiFlight.created_at,
    updatedAt: (apiFlight as any).modified_at || apiFlight.created_at
  }
}

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

  // Pass through arrival_time and departure_time directly
  if (flight.arrivalTime !== undefined) {
    result.arrival_time = flight.arrivalTime
  }

  if (flight.departureTime !== undefined) {
    result.departure_time = flight.departureTime
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

  if (flight.notes !== undefined) {
    result.notes = flight.notes
  }

  if (flight.source !== undefined) {
    result.created_by_source = flight.source
  }

  // Only include call_sign if explicitly provided (for creates)
  // Don't send it on updates as it might conflict with existing data
  if (flight.id && flight.id.startsWith('manual-')) {
    // This is a new flight, set call_sign
    result.call_sign = `MAN-${Date.now()}`
  }

  // Filter out any undefined/null values
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined || result[key] === null) {
      delete result[key]
    }
  })

  return result
}
