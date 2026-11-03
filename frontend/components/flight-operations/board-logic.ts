import { addLocalDays, formatLocalDate } from '@/lib/local-date'
import type { Flight, FlightFilters } from './types'

// Pure board logic, extracted verbatim from flight-board.tsx and app/page.tsx (no behavior change).

export function filterFlights(
  flights: Flight[],
  filters: FlightFilters
): Flight[] {
  // F4: filters.dateRange (today/tomorrow/week/all) is intentionally NOT applied here, matching the
  // board's behavior today.
  return flights.filter((flight) => {
    // Filter by search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch =
        flight.tailNumber.toLowerCase().includes(searchLower) ||
        flight.aircraftType.toLowerCase().includes(searchLower) ||
        flight.origin?.toLowerCase().includes(searchLower) ||
        flight.destination?.toLowerCase().includes(searchLower) ||
        flight.contactName?.toLowerCase().includes(searchLower)

      if (!matchesSearch) return false
    }

    // Filter by status
    if (filters.status !== 'all' && flight.status !== filters.status) {
      return false
    }

    // Filter by services
    if (filters.services.length > 0) {
      const hasAllServices = filters.services.every((service) =>
        flight.services.includes(service)
      )
      if (!hasAllServices) return false
    }

    return true
  })
}

// D2/D6: a flight is listed in Arrivals when it has a scheduled arrival and in Departures when it has a
// scheduled departure. A quick turn always has both, so it lands in both columns; arrival-only (return)
// and departure-only (hangar pull) flights land in just one.
export function partitionFlights(flights: Flight[]): {
  arrivals: Flight[]
  departures: Flight[]
} {
  const arrivals = flights.filter((f) => !!f.arrivalTime)
  const departures = flights.filter((f) => !!f.departureTime)
  return { arrivals, departures }
}

// Sunday-start local-time week containing `date`, shifted by weekOffset weeks. end is exclusive.
export function weekRange(
  date: Date,
  weekOffset: number
): { start: Date; end: Date } {
  // Local-time getDay/setDate/setHours: calendar arithmetic in the runtime zone, so DST-safe.
  const currentDay = date.getDay() // 0 = Sunday
  const start = new Date(date)
  start.setDate(date.getDate() - currentDay + weekOffset * 7)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 7)

  return { start, end }
}

// Query params for the week shown by weekRange(date, weekOffset): local "YYYY-MM-DD" first and last
// (inclusive) day. The repo converts these to UTC instants at local day boundaries.
export function weekDateParams(
  date: Date,
  weekOffset: number
): { startDate: string; endDate: string } {
  const startDate = formatLocalDate(weekRange(date, weekOffset).start)
  return { startDate, endDate: addLocalDays(startDate, 6) }
}
