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

// The form's date and "HH:mm" fields, all wall-clock in one zone.
export interface FormTimes {
  date: string
  arrival: string
  departure: string
  actualArrival: string
  actualDeparture: string
}

// Rebuilds the instants the form would save (same chaining rules as the submit handler) in `from`, and
// re-reads them as date/time strings in `to`. Used when the Zulu toggle flips while the sheet is open:
// the typed instants stay put, only their display changes. With no time typed, a date that was "today"
// in `from` becomes today in `to`; any other date is kept.
export function convertFormZone(
  form: FormTimes,
  from: string,
  to: string,
  now: Date = new Date()
): FormTimes {
  if (from === to) return form
  const arrival = buildTimestamp(form.date, form.arrival, undefined, from)
  const departure = buildTimestamp(form.date, form.departure, form.arrival, from)
  const actualArrival = buildTimestamp(form.date, form.actualArrival, undefined, from)
  const actualDeparture = buildTimestamp(
    form.date,
    form.actualDeparture,
    form.actualArrival || form.arrival,
    from
  )
  const anchor = arrival ?? departure ?? actualArrival ?? actualDeparture
  const date = anchor
    ? toDateInput(anchor, to)
    : form.date === formatLocalDate(now, from)
      ? formatLocalDate(now, to)
      : form.date
  return {
    date,
    arrival: toTimeInput(arrival, to),
    departure: toTimeInput(departure, to),
    actualArrival: toTimeInput(actualArrival, to),
    actualDeparture: toTimeInput(actualDeparture, to)
  }
}
