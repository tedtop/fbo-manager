// Pure time logic for the flight form (BACKLOG B09b, docs/PLAN.md D2/D6). Times are "HH:mm" strings
// as held by <input type="time">; "" means blank.

import { addLocalDays, formatLocalDate, formatLocalTime, zonedTimeToInstant } from '@/lib/local-date'

export const QUICK_TURN_MINUTES = 60

export interface ScheduledTimesState {
  arrival: string
  departure: string
  quickTurn: boolean
}

// "HH:mm" + minutes, wrapping past midnight. "" (or an unparsable value) stays "".
export function addMinutesToTime(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return ''
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
    .toString()
    .padStart(2, '0')
  const m = (wrapped % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

// Quick turn: departure is arrival + 1 h (blank when there is no arrival).
export function quickTurnDeparture(arrival: string): string {
  return addMinutesToTime(arrival, QUICK_TURN_MINUTES)
}

// Arrival edited: with QT on, departure follows it.
export function applyArrivalChange(
  state: ScheduledTimesState,
  arrival: string
): ScheduledTimesState {
  return state.quickTurn
    ? { ...state, arrival, departure: quickTurnDeparture(arrival) }
    : { ...state, arrival }
}

// Departure edited by hand: it no longer matches the QT rule, so QT is cleared.
export function applyDepartureChange(
  state: ScheduledTimesState,
  departure: string
): ScheduledTimesState {
  return { ...state, departure, quickTurn: false }
}

// QT toggled: turning it on recomputes departure from arrival (kept as-is if there is no arrival).
export function applyQuickTurnChange(
  state: ScheduledTimesState,
  quickTurn: boolean
): ScheduledTimesState {
  if (quickTurn && state.arrival) {
    return { ...state, quickTurn, departure: quickTurnDeparture(state.arrival) }
  }
  return { ...state, quickTurn }
}

// Real validation (replaces the old dead alert): at least one scheduled time, per D6 and the DB CHECK.
export function validateScheduledTimes(
  arrival: string,
  departure: string
): string | null {
  return arrival || departure
    ? null
    : 'Enter a scheduled arrival time, a departure time, or both.'
}

// Only a flight with both times can be a quick turn.
export function isQuickTurnSaved(state: ScheduledTimesState): boolean {
  return state.quickTurn && !!state.arrival && !!state.departure
}

// `date` is a "YYYY-MM-DD", `time` an "HH:mm", both wall-clock in `zone` (the browser's zone when omitted;
// pass the board's display zone, or 'UTC' in Zulu mode). Returns the real instant as a UTC ISO string
// (Date.toISOString) so Postgres timestamptz stores exactly what the user meant. A time earlier than
// `notBefore` ("HH:mm") is taken to be on the next day, so a QT arrival at 23:30 gets a 00:30
// departure on the following date. The next day is calendar arithmetic (DST-safe), not +24 h.
export function buildTimestamp(
  date: string,
  time: string,
  notBefore?: string,
  zone?: string
): string | undefined {
  if (!time) return undefined
  const dayShift = notBefore && time < notBefore ? 1 : 0
  const [y, mo, d] = addLocalDays(date, dayShift).split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const instant = zonedTimeToInstant(y, mo, d, h, mi, zone)
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString()
}

// Splits a stored instant back into the "YYYY-MM-DD" / "HH:mm" (in `zone`, browser-local when omitted)
// the form fields hold.
export function toDateInput(timestamp?: string, zone?: string): string {
  return timestamp ? formatLocalDate(new Date(timestamp), zone) : ''
}

export function toTimeInput(timestamp?: string, zone?: string): string {
  return timestamp ? formatLocalTime(new Date(timestamp), zone) : ''
}

// The form's date and "HH:mm" fields, all wall-clock in one zone. `date` is the stay's first date (the
// arrival's, or the departure's for a hangar pull). The other three dates are optional overrides (B40):
// "" / undefined = automatic (same day as `date`; a departure earlier than the arrival time rolls to the
// next day), a "YYYY-MM-DD" = that exact day, e.g. a 3-day stay or an actual arrival after midnight.
export interface FormTimes {
  date: string
  arrival: string
  departure: string
  actualArrival: string
  actualDeparture: string
  departureDate?: string
  actualArrivalDate?: string
  actualDepartureDate?: string
}

export interface FormInstants {
  arrival?: string
  departure?: string
  actualArrival?: string
  actualDeparture?: string
}

// The date each time lands on when it has no override. Mirrors the chaining the form always had: the
// departure and the actual departure fall on the next day when earlier than the time before them.
function autoDate(form: FormTimes, field: keyof FormInstants): { date: string; notBefore?: string } {
  switch (field) {
    case 'departure':
      return { date: form.date, notBefore: form.arrival }
    case 'actualDeparture':
      return { date: form.date, notBefore: form.actualArrival || form.arrival }
    default:
      return { date: form.date }
  }
}

// Rebuilds the instants the form would save, in `zone`. An explicit date wins and is never rolled.
export function formTimestamps(form: FormTimes, zone?: string): FormInstants {
  const overrides: Record<keyof FormInstants, string | undefined> = {
    arrival: undefined,
    departure: form.departureDate,
    actualArrival: form.actualArrivalDate,
    actualDeparture: form.actualDepartureDate
  }
  const times: Record<keyof FormInstants, string> = {
    arrival: form.arrival,
    departure: form.departure,
    actualArrival: form.actualArrival,
    actualDeparture: form.actualDeparture
  }
  const out: FormInstants = {}
  for (const field of ['arrival', 'departure', 'actualArrival', 'actualDeparture'] as const) {
    const explicit = overrides[field]
    const auto = autoDate(form, field)
    out[field] = explicit
      ? buildTimestamp(explicit, times[field], undefined, zone)
      : buildTimestamp(auto.date, times[field], auto.notBefore, zone)
  }
  return out
}

// The date shown in each time's own date field: the override, else the automatic day. Blank time -> blank.
export function displayDates(form: FormTimes, zone?: string): Record<keyof FormInstants, string> {
  const inst = formTimestamps(form, zone)
  const dateOf = (t?: string) => (t ? toDateInput(t, zone) : '')
  return {
    arrival: form.arrival ? form.date : '',
    departure: dateOf(inst.departure),
    actualArrival: dateOf(inst.actualArrival),
    actualDeparture: dateOf(inst.actualDeparture)
  }
}

// Stored instants -> form fields in `zone`. Dates that differ from the automatic day become overrides, so
// a plain same-day flight loads with none and a 3-day stay loads each date correctly.
export function formFromInstants(inst: FormInstants, zone?: string, fallbackDate = ''): FormTimes {
  const first = inst.arrival ?? inst.departure ?? inst.actualArrival ?? inst.actualDeparture
  const base: FormTimes = {
    date: first ? toDateInput(first, zone) : fallbackDate,
    arrival: toTimeInput(inst.arrival, zone),
    departure: toTimeInput(inst.departure, zone),
    actualArrival: toTimeInput(inst.actualArrival, zone),
    actualDeparture: toTimeInput(inst.actualDeparture, zone)
  }
  const auto = formTimestamps(base, zone)
  const pick = (field: 'departure' | 'actualArrival' | 'actualDeparture'): string => {
    const actual = inst[field]
    if (!actual) return ''
    const day = toDateInput(actual, zone)
    return auto[field] && toDateInput(auto[field], zone) === day ? '' : day
  }
  const result = { ...base }
  const departureDate = pick('departure')
  const actualArrivalDate = pick('actualArrival')
  const actualDepartureDate = pick('actualDeparture')
  if (departureDate) result.departureDate = departureDate
  if (actualArrivalDate) result.actualArrivalDate = actualArrivalDate
  if (actualDepartureDate) result.actualDepartureDate = actualDepartureDate
  return result
}

// Rebuilds the instants the form would save in `from`, and re-reads them as date/time strings in `to`.
// Used when the Zulu toggle flips while the sheet is open: the typed instants stay put, only their display
// changes. With no time typed, a date that was "today" in `from` becomes today in `to`; any other is kept.
export function convertFormZone(
  form: FormTimes,
  from: string,
  to: string,
  now: Date = new Date()
): FormTimes {
  if (from === to) return form
  const inst = formTimestamps(form, from)
  const anyTime = inst.arrival ?? inst.departure ?? inst.actualArrival ?? inst.actualDeparture
  const fallback = form.date === formatLocalDate(now, from) ? formatLocalDate(now, to) : form.date
  const next = formFromInstants(inst, to, fallback)
  return anyTime ? next : { ...next, date: fallback }
}

// "2h 5m" / "45m" / "3d 4h 0m" between two instants; "N/A" when either is missing or departure is earlier.
export function formatGroundTime(arrival?: string, departure?: string): string {
  if (!arrival || !departure) return 'N/A'
  const total = Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 60000)
  if (!Number.isFinite(total) || total < 0) return 'N/A'
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`
}
