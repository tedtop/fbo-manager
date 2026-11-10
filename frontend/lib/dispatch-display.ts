// Fuel Dispatch display logic, ported from Minuteman's public/fuel_dispatch.html so both screens
// read the same way: date parsing, countdowns and their urgency colour, gate labels, and the
// between-poll change detection that flags fuel / gate / time edits on a card.
import type { QTDispatch } from '@/types/qt-dispatch'

// "-", "?" and "0" are QT's placeholder TerminalNumber values for gates that are not inside a
// lettered concourse: the bare gate number is then the whole story, with no "A"/"B" prefix.
const GATE_UNKNOWN = new Set<string | null | undefined>([null, undefined, '', '?'])
const TERMINAL_UNKNOWN = new Set<string | null | undefined>([null, undefined, '', '-', '?', '0'])

export const CHANGE_RETENTION_MS = 3 * 60 * 60 * 1000 // stop flagging a change after 3 hours
export const URGENCY_CRITICAL_MINUTES = 15
export const URGENCY_WARN_MINUTES = 45

export function isGateKnown(gate: string | null | undefined): boolean {
  return !GATE_UNKNOWN.has(gate)
}

/** "A4", "B2", or the bare number when QT gives no concourse. Null when the gate is not assigned. */
export function gateLabel(dispatch: Pick<QTDispatch, 'Gate' | 'TerminalNumber'>): string | null {
  if (!isGateKnown(dispatch.Gate)) return null
  return TERMINAL_UNKNOWN.has(dispatch.TerminalNumber)
    ? String(dispatch.Gate)
    : `${dispatch.TerminalNumber}${dispatch.Gate}`
}

// QT sends "0001-01-01 00:00" (.NET's DateTime.MinValue) rather than null for a date that has not
// been assigned yet. Treat it as missing instead of parsing it into a multi-million-hour countdown.
export function isQtNullDate(value: string | null | undefined): boolean {
  return !value || value.startsWith('0001-01-01')
}

// QT dates are "YYYY-MM-DD HH:MM" in airport-local time. The "T" form is spec'd to parse as local
// time in every browser; the space form is not (older Safari returns Invalid Date).
export function parseQtDate(value: string | null | undefined): Date | null {
  if (isQtNullDate(value)) return null
  const date = new Date((value as string).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatLbs(n: number): string {
  return Math.round(n).toLocaleString()
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseQtDate(value)
  if (!date) return 'N/A'
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export function formatTimeOnly(value: string | null | undefined): string {
  const date = parseQtDate(value)
  if (!date) return 'N/A'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function formatCountdown(value: string | null | undefined, now = Date.now()): string {
  const date = parseQtDate(value)
  if (!date) return 'N/A'
  const diff = Math.round((date.getTime() - now) / 60000)
  if (Math.abs(diff) <= 1) return 'any moment'
  return diff > 0 ? `in ${formatMinutes(diff)}` : `overdue by ${formatMinutes(-diff)}`
}

/** Signed minutes until the date (negative once overdue), or null when there is nothing to count down to. */
export function countdownMinutes(value: string | null | undefined, now = Date.now()): number | null {
  const date = parseQtDate(value)
  return date ? (date.getTime() - now) / 60000 : null
}

/** Orange inside the warn window, red inside the critical window or overdue, nothing when far out. */
export function urgencyClass(minutes: number | null): '' | 'fd-urgency-warn' | 'fd-urgency-critical' {
  if (minutes == null) return ''
  if (minutes <= URGENCY_CRITICAL_MINUTES) return 'fd-urgency-critical'
  if (minutes <= URGENCY_WARN_MINUTES) return 'fd-urgency-warn'
  return ''
}

export function formatElapsedSince(value: string | null | undefined, now = Date.now()): string {
  const date = parseQtDate(value)
  if (!date) return 'N/A'
  const elapsed = Math.round((now - date.getTime()) / 60000)
  return elapsed < 1 ? 'just in' : formatMinutes(elapsed)
}

export const normalizeTail = (tail: string | null | undefined): string =>
  typeof tail === 'string' ? tail.trim().toUpperCase() : ''

/** Live ADS-B overlay for one tail, from /api/qt/flight-track. */
export interface FlightTrack {
  distanceNm: number | null
  groundSpeedKt: number | null
  altitudeFt: number | null
  onGround: boolean | null
  etaMinutes: number | null
  equipmentCode: string | null
}

// --- Change tracking -------------------------------------------------------------------------
// Compares each poll with the previous one and records fuel / gate / time changes per flight so the
// card can flag them even though the next poll will look "unchanged". Keyed by FlightID, because QT
// issues a new TransactionID on every edit.

export interface DispatchSnapshot {
  QuantityInWeight: number
  Gate?: string
  DepartureDate?: string
  ArrivalDate?: string
}

export interface DispatchChanges {
  fuel: { oldValue: number; newValue: number; increased: boolean; detectedAt: number }[]
  gate: { oldValue: string | undefined; newValue: string | undefined; detectedAt: number }[]
  time: { label: 'Departure' | 'Arrival'; oldValue: string; newValue: string; detectedAt: number }[]
}

export const changeKey = (d: Pick<QTDispatch, 'FlightID' | 'TransactionID'>): string | null => {
  const key = d.FlightID || d.TransactionID
  return key ? String(key) : null
}

const hasChanges = (c: DispatchChanges) => c.fuel.length > 0 || c.gate.length > 0 || c.time.length > 0

/**
 * Updates `snapshots` and `changes` in place for the latest poll, the same rules as Minuteman:
 * fuel moves only count once a quantity was set; gate only between two known gates; a departure
 * change wins over an arrival change in the same poll. Changes drop once a flight completes or
 * leaves the feed, and each transition ages out after CHANGE_RETENTION_MS.
 */
export function detectDispatchChanges(
  dispatches: QTDispatch[],
  snapshots: Map<string, DispatchSnapshot>,
  changes: Map<string, DispatchChanges>,
  now = Date.now()
): void {
  const byKey = new Map<string, QTDispatch>()
  for (const d of dispatches) {
    const key = changeKey(d)
    if (key) byKey.set(key, d)
  }

  byKey.forEach((dispatch, key) => {
    const prev = snapshots.get(key)
    snapshots.set(key, {
      QuantityInWeight: dispatch.QuantityInWeight,
      Gate: dispatch.Gate,
      DepartureDate: dispatch.DepartureDate,
      ArrivalDate: dispatch.ArrivalDate
    })
    if (!prev) return // first sighting: nothing to diff against

    const entry: DispatchChanges = changes.get(key) ?? { fuel: [], gate: [], time: [] }

    if (prev.QuantityInWeight > 0 && dispatch.QuantityInWeight !== prev.QuantityInWeight) {
      entry.fuel.push({
        oldValue: prev.QuantityInWeight,
        newValue: dispatch.QuantityInWeight,
        increased: dispatch.QuantityInWeight > prev.QuantityInWeight,
        detectedAt: now
      })
    }

    if (isGateKnown(prev.Gate) && isGateKnown(dispatch.Gate) && dispatch.Gate !== prev.Gate) {
      entry.gate.push({ oldValue: prev.Gate, newValue: dispatch.Gate, detectedAt: now })
    }

    if (prev.DepartureDate && dispatch.DepartureDate && dispatch.DepartureDate !== prev.DepartureDate) {
      entry.time.push({ label: 'Departure', oldValue: prev.DepartureDate, newValue: dispatch.DepartureDate, detectedAt: now })
    } else if (prev.ArrivalDate && dispatch.ArrivalDate && dispatch.ArrivalDate !== prev.ArrivalDate) {
      entry.time.push({ label: 'Arrival', oldValue: prev.ArrivalDate, newValue: dispatch.ArrivalDate, detectedAt: now })
    }

    if (hasChanges(entry)) changes.set(key, entry)
  })

  for (const key of [...changes.keys()]) {
    const dispatch = byKey.get(key)
    if (!dispatch || dispatch.FlightStatus === 'Completed') {
      changes.delete(key)
      continue
    }
    const entry = changes.get(key) as DispatchChanges
    entry.fuel = entry.fuel.filter((c) => now - c.detectedAt <= CHANGE_RETENTION_MS)
    entry.gate = entry.gate.filter((c) => now - c.detectedAt <= CHANGE_RETENTION_MS)
    entry.time = entry.time.filter((c) => now - c.detectedAt <= CHANGE_RETENTION_MS)
    if (!hasChanges(entry)) changes.delete(key)
  }
}
