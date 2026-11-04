import { addLocalDays, formatLocalDate, parseLocalDate, toInstantIso } from '@/lib/local-date'
import type { Flight, FlightFilters } from './types'

// Pure board logic, extracted verbatim from flight-board.tsx and app/page.tsx (no behavior change).

// Local-day [start, end) of the toolbar date range, or null for 'all'. today/tomorrow are local calendar
// days; week is the Sunday-start local week containing `now` (same as weekRange). today_future starts at
// local midnight today and has no end (end: null).
export function dateRangeBounds(
  dateRange: FlightFilters['dateRange'],
  now: Date
): { start: Date; end: Date | null } | null {
  const today = formatLocalDate(now)
  switch (dateRange) {
    case 'today':
      return { start: parseLocalDate(today), end: parseLocalDate(addLocalDays(today, 1)) }
    case 'today_future':
      return { start: parseLocalDate(today), end: null }
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
// is set (then either one inside the range matches). With no end (Today + Future) the upper bounds drop out:
// every flight whose stay ends at or after `start` matches.
function flightInRange(flight: Flight, start: Date, end: Date | null): boolean {
  const ms = (t?: string) => (t ? new Date(toInstantIso(t)).getTime() : null)
  const arrival = ms(flight.arrivalTime)
  const departure = ms(flight.departureTime)
  const lo = start.getTime()
  const hi = end ? end.getTime() : Number.POSITIVE_INFINITY

  if (arrival !== null) return arrival < hi && (departure === null || departure >= lo)
  if (departure !== null) return departure >= lo && departure < hi

  return [flight.actualArrivalTime, flight.actualDepartureTime].some((t) => {
    const v = ms(t)
    return v !== null && v >= lo && v < hi
  })
}

// B43b / D13: a flight is hidden once its hidden_at has passed. The Hide button stores now(); setting a flight
// to Departed stores the start of the day after its departure day (flights.repo updateFlight), so it stays
// visible on the departure day and drops off the next. findAllFlights applies the same test server-side.
export function isFlightHidden(flight: Pick<Flight, 'hiddenAt'>, now: Date): boolean {
  return !!flight.hiddenAt && new Date(flight.hiddenAt).getTime() <= now.getTime()
}

// Default list fetch window: local yesterday .. today+14, widened so the current week (used by the
// 'week' filter) is always inside it. Dates are local "YYYY-MM-DD", both inclusive. For Today + Future
// there is no end date (the fetch is unbounded above, matching the filter), so endDate is omitted.
export function listFetchWindow(
  now: Date,
  dateRange?: FlightFilters['dateRange']
): { startDate: string; endDate?: string } {
  const today = formatLocalDate(now)
  const week = weekDateParams(now, 0)
  const yesterday = addLocalDays(today, -1)
  const plus14 = addLocalDays(today, 14)
  const startDate = week.startDate < yesterday ? week.startDate : yesterday
  if (dateRange === 'today_future') return { startDate }
  return { startDate, endDate: week.endDate > plus14 ? week.endDate : plus14 }
}

export function filterFlights(
  flights: Flight[],
  filters: FlightFilters,
  now: Date = new Date()
): Flight[] {
  const bounds = dateRangeBounds(filters.dateRange, now)
  return flights.filter((flight) => {
    if (bounds && !flightInRange(flight, bounds.start, bounds.end)) return false
    if (!filters.showHidden && isFlightHidden(flight, now)) return false

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
  const arrivals = flights
    .filter((f) => !!f.arrivalTime)
    .sort((a, b) => compareScheduled(a.arrivalTime, b.arrivalTime))
  const departures = flights
    .filter((f) => !!f.departureTime)
    .sort((a, b) => compareScheduled(a.departureTime, b.departureTime))
  return { arrivals, departures }
}

// Each column runs soonest first by its own scheduled time (a TBM leaving at 07:30 sits above a Citation
// leaving at 12:00). Array.sort is stable, so equal times keep the order the flights came in.
function compareScheduled(a?: string, b?: string): number {
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime()
}

// Flightradar24 aircraft page for a registration ("N868CB" -> .../data/aircraft/n868cb).
export function flightradarUrl(tailNumber: string): string {
  return `https://www.flightradar24.com/data/aircraft/${encodeURIComponent(tailNumber.trim().toLowerCase())}`
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

// B18: empty-state copy. "Active filters" are the toolbar's search, status, services and Show hidden; the date range is
// not one (it always has a value), so it only shapes the wording of a truly empty day/week.
const titleCase = (value: string) =>
  value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

// Human-readable parts for each active filter, e.g. ["status = Arrived", "search 'N12'"].
export function activeFilterParts(filters: FlightFilters): string[] {
  const parts: string[] = []
  if (filters.status !== 'all') parts.push(`status = ${titleCase(filters.status)}`)
  if (filters.search) parts.push(`search '${filters.search}'`)
  if (filters.services.length > 0) {
    parts.push(`services = ${filters.services.map(titleCase).join(', ')}`)
  }
  if (filters.showHidden) parts.push('showing hidden')
  return parts
}

export function hasActiveFilters(filters: FlightFilters): boolean {
  return activeFilterParts(filters).length > 0
}

// Resets search, status, services and Show hidden but keeps the chosen date range.
export function clearActiveFilters(filters: FlightFilters): FlightFilters {
  return { ...filters, search: '', status: 'all', services: [], showHidden: false }
}

const RANGE_PHRASE: Record<FlightFilters['dateRange'], string> = {
  today: 'today',
  today_future: 'today or later',
  tomorrow: 'tomorrow',
  week: 'this week',
  all: 'found'
}

// Copy for an empty list. `baseCount` is how many flights the list would hold with only the date range
// applied: when that is above zero the filters are what emptied it ("No arrivals match: ..." plus a Clear
// filters action); otherwise the day/week is genuinely empty ("No arrivals today").
export function emptyStateMessage(
  noun: 'arrivals' | 'departures' | 'flights',
  filters: FlightFilters,
  baseCount: number
): { title: string; filtered: boolean } {
  if (baseCount > 0 && hasActiveFilters(filters)) {
    return {
      title: `No ${noun} match: ${activeFilterParts(filters).join(', ')}`,
      filtered: true
    }
  }
  return { title: `No ${noun} ${RANGE_PHRASE[filters.dateRange]}`, filtered: false }
}
