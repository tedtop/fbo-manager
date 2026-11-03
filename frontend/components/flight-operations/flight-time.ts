// Pure time logic for the flight form (BACKLOG B09b, docs/PLAN.md D2/D6). Times are "HH:mm" strings
// as held by <input type="time">; "" means blank.

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

// `date` is "YYYY-MM-DD". A time earlier than `notBefore` ("HH:mm") is taken to be on the next day, so
// a QT arrival at 23:30 gets a 00:30 departure on the following date.
export function buildTimestamp(
  date: string,
  time: string,
  notBefore?: string
): string | undefined {
  if (!time) return undefined
  let day = date
  if (notBefore && time < notBefore) {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    day = d.toISOString().slice(0, 10)
  }
  return `${day}T${time}:00`
}
