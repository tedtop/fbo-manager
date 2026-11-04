import { addLocalDays, formatLocalDate, parseLocalDate, toInstantIso } from '@/lib/local-date'
import type { Flight, FlightFilters } from './types'

// Pure board logic, extracted verbatim from flight-board.tsx and app/page.tsx (no behavior change).

// Local-day [start, end) of the toolbar date range, or null for 'all'. today/tomorrow are local calendar
// days; week is the Sunday-start local week containing `now` (same as weekRange).
export function dateRangeBounds(
  dateRange: FlightFilters['dateRange'],
  now: Date
): { start: Date; end: Date } | null {
  const today = formatLocalDate(now)
  switch (dateRange) {
    case 'today':
      return { start: parseLocalDate(today), end: parseLocalDate(addLocalDays(today, 1)) }
    case 'tomorrow':
      return {
        start: parseLocalDate(addLocalDays(today, 1)),
        end: parseLocalDate(addLocalDays(today, 2))
      }
    case 'week':
      return weekRange(now, 0)
    default:
      return null
  }
}

// B43: a flight is on the board for every day of its stay. Scheduled overlap rule on [start, end):
// arrival < end AND (no departure OR departure >= start). A departure-only flight (no arrival) matches on
// its departure day only. The repo's findAll applies the same rule server-side, so the row is fetched even
// when the plane arrived before the fetch window. Actual times are used only when neither scheduled time
// is set (then either one inside the range matches).
function flightInRange(flight: Flight, start: Date, end: Date): boolean {
  const ms = (t?: string) => (t ? new Date(toInstantIso(t)).getTime() : null)
  const arrival = ms(flight.arrivalTime)
  const departure = ms(flight.departureTime)
  const lo = start.getTime()
  const hi = end.getTime()

  if (arrival !== null) return arrival < hi && (departure === null || departure >= lo)
  if (departure !== null) return departure >= lo && departure < hi

  return [flight.actualArrivalTime, flight.actualDepartureTime].some((t) => {
    const v = ms(t)
    return v !== null && v >= lo && v < hi
  })
}

// Default list fetch window: local yesterday .. today+14, widened so the current week (used by the
// 'week' filter) is always inside it. Dates are local "YYYY-MM-DD", both inclusive.
export function listFetchWindow(now: Date): { startDate: string; endDate: string } {
  const today = formatLocalDate(now)
  const week = weekDateParams(now, 0)
  const yesterday = addLocalDays(today, -1)
  const plus14 = addLocalDays(today, 14)
  return {
    startDate: week.startDate < yesterday ? week.startDate : yesterday,
    endDate: week.endDate > plus14 ? week.endDate : plus14
  }
}

export function filterFlights(
  flights: Flight[],
  filters: FlightFilters,
  now: Date = new Date()
): Flight[] {
  const bounds = dateRangeBounds(filters.dateRange, now)
  return flights.filter((flight) => {
    if (bounds && !flightInRange(flight, bounds.start, bounds.end)) return false

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

// A flight listed in both columns is ONE record (same id), so its two cards are "linked": they share a
// colour and highlight together on hover (B42).
export function linkedFlightIds(arrivals: Flight[], departures: Flight[]): Set<string> {
  const departureIds = new Set(departures.map((f) => f.id))
  return new Set(arrivals.filter((f) => departureIds.has(f.id)).map((f) => f.id))
}

// Full literal class names (Tailwind only emits classes it can read in the source).
export type LinkColor = { border: string; ring: string; tint: string; text: string }
export const LINK_COLORS: LinkColor[] = [
  { border: 'border-l-emerald-500/60', ring: 'ring-emerald-500', tint: 'bg-emerald-500/20', text: 'text-emerald-500' },
  { border: 'border-l-sky-500/60', ring: 'ring-sky-500', tint: 'bg-sky-500/20', text: 'text-sky-500' },
  { border: 'border-l-violet-500/60', ring: 'ring-violet-500', tint: 'bg-violet-500/20', text: 'text-violet-500' },
  { border: 'border-l-rose-500/60', ring: 'ring-rose-500', tint: 'bg-rose-500/20', text: 'text-rose-500' },
  { border: 'border-l-amber-500/60', ring: 'ring-amber-500', tint: 'bg-amber-500/20', text: 'text-amber-500' },
  { border: 'border-l-cyan-500/60', ring: 'ring-cyan-500', tint: 'bg-cyan-500/20', text: 'text-cyan-500' },
  { border: 'border-l-pink-500/60', ring: 'ring-pink-500', tint: 'bg-pink-500/20', text: 'text-pink-500' },
  { border: 'border-l-lime-500/60', ring: 'ring-lime-500', tint: 'bg-lime-500/20', text: 'text-lime-500' }
]

// Rotates through the palette in set order; both cards of a flight look the color up by the same id.
export function assignLinkColors(ids: Set<string>): Map<string, LinkColor> {
  const colors = new Map<string, LinkColor>()
  Array.from(ids).forEach((id, index) => colors.set(id, LINK_COLORS[index % LINK_COLORS.length]))
  return colors
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
