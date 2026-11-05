// Pairs single-leg rows of the same tail into one flight (BACKLOG B45b; rule in docs/PLAN.md "B45 Schedule sheet import design").
// Some front-desk reports print one row per LEG (a date, a time and an Action of Arrive or Depart). After extraction and
// normalisation, and before mapping, an arrival-only row is merged with the departure-only row that follows it.
// Pure: no network, no database.

import { isBlankToken, normalizeTail, str } from './normalize'
import type { ExtractedScheduleRow, ExtractionConfidence } from './types'

export interface PairedRow {
  /** The row to map: the merged row when paired, otherwise the original row untouched. */
  row: ExtractedScheduleRow
  /** The printed row(s) this came from: 1 when unpaired, 2 (arrival row, then departure row) when paired. */
  sourceRows: ExtractedScheduleRow[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/

const hasArrival = (r: ExtractedScheduleRow) => !isBlankToken(r.arrival_time)
const hasDeparture = (r: ExtractedScheduleRow) => !isBlankToken(r.departure_time)
export const isArrivalOnlyRow = (r: ExtractedScheduleRow) => hasArrival(r) && !hasDeparture(r)
export const isDepartureOnlyRow = (r: ExtractedScheduleRow) => hasDeparture(r) && !hasArrival(r)

/** "YYYY-MM-DD HH:mm" of a leg (its own date, else the day heading), or null when not comparable. Sorts lexicographically. */
function legKey(r: ExtractedScheduleRow, leg: 'arrival' | 'departure'): string | null {
  const date = (leg === 'arrival' ? r.arrival_date : r.departure_date) || r.group_date
  const time = leg === 'arrival' ? r.arrival_time : r.departure_time
  return ISO_DATE.test(date) && HHMM.test(time) ? `${date} ${time}` : null
}

const CONFIDENCE_RANK: ExtractionConfidence[] = ['low', 'medium', 'high']

function joinDistinct(parts: string[], separator: string): string {
  const out: string[] = []
  for (const p of parts.map(str).filter(Boolean)) {
    if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p)
  }
  return out.join(separator)
}

function splitDistinct(texts: string[], splitter: RegExp, separator: string): string {
  return joinDistinct(texts.flatMap((t) => t.split(splitter)), separator)
}

/** Merges an arrival-only row and the departure-only row after it into one both-times row. */
export function mergeLegRows(arrival: ExtractedScheduleRow, departure: ExtractedScheduleRow): ExtractedScheduleRow {
  const lowest = [arrival.confidence, departure.confidence].sort(
    (a, b) => CONFIDENCE_RANK.indexOf(a) - CONFIDENCE_RANK.indexOf(b)
  )[0]
  return {
    tail_number: arrival.tail_number || departure.tail_number,
    aircraft_type: arrival.aircraft_type || departure.aircraft_type,
    customer: joinDistinct([arrival.customer, departure.customer], ' / '),
    group_date: arrival.group_date || departure.group_date,
    arrival_date: arrival.arrival_date,
    arrival_time: arrival.arrival_time,
    departure_date: departure.departure_date,
    departure_time: departure.departure_time,
    services: splitDistinct([arrival.services, departure.services], /[,;|\n]+/, ', '),
    notes: splitDistinct([arrival.notes, departure.notes], /;/, '; '),
    raw_row_text: [arrival.raw_row_text, departure.raw_row_text].filter(Boolean).join(' // '),
    needs_review: arrival.needs_review || departure.needs_review,
    confidence: lowest,
    page: arrival.page
  }
}

/**
 * Pairs arrival-only rows with departure-only rows of the same tail, in printed order of the result (a pair sits where its
 * arrival row was). Each departure-only row takes the NEAREST EARLIER arrival-only row of its tail that is still unpaired,
 * and each row is used once, so Arrive 11/01, Arrive 11/05, Depart 11/06 pairs 11/05 -> 11/06 and leaves 11/01 alone.
 * Legs are compared by their own printed date (else the day heading) and time; a leg without a usable date/time, a row with
 * no tail, a row that already has both times and a row with neither time are left untouched. A departure must be strictly
 * later than the arrival.
 */
export function pairSingleLegRows(rows: readonly ExtractedScheduleRow[]): PairedRow[] {
  const partnerOfArrival = new Map<number, number>() // arrival row index -> departure row index
  const pairedDepartures = new Set<number>()

  const departures = rows
    .map((r, i) => ({ r, i, key: isDepartureOnlyRow(r) && normalizeTail(r.tail_number) ? legKey(r, 'departure') : null }))
    .filter((d): d is { r: ExtractedScheduleRow; i: number; key: string } => d.key !== null)
    .sort((a, b) => a.key.localeCompare(b.key) || a.i - b.i)

  for (const dep of departures) {
    const tail = normalizeTail(dep.r.tail_number)
    let best: { i: number; key: string } | null = null
    rows.forEach((r, i) => {
      if (partnerOfArrival.has(i) || !isArrivalOnlyRow(r) || normalizeTail(r.tail_number) !== tail) return
      const key = legKey(r, 'arrival')
      if (key === null || key >= dep.key) return
      if (!best || key > best.key || (key === best.key && i > best.i)) best = { i, key }
    })
    if (best) {
      partnerOfArrival.set((best as { i: number }).i, dep.i)
      pairedDepartures.add(dep.i)
    }
  }

  const out: PairedRow[] = []
  rows.forEach((row, i) => {
    if (pairedDepartures.has(i)) return
    const partner = partnerOfArrival.get(i)
    if (partner === undefined) out.push({ row, sourceRows: [row] })
    else out.push({ row: mergeLegRows(row, rows[partner]), sourceRows: [row, rows[partner]] })
  })
  return out
}
