// ExtractedScheduleRow -> ScheduleFlightDraft (BACKLOG B45a; rules in docs/PLAN.md "B45 Schedule sheet import design").
// Pure: no network, no database, no dependence on the process TZ.

import {
  isBlankToken,
  isPlausibleTail,
  normalizeTail,
  parseDate,
  parseTime,
  str
} from './normalize'
import type {
  ExtractedScheduleRow,
  ScheduleDirection,
  ScheduleFlightDraft,
  ScheduleReviewReason
} from './types'
import { addDaysToDateString, zonedWallTimeToInstant } from './zoned-time'

export interface MapRowOptions {
  /** The sheet's single printed date ("YYYY-MM-DD"), used when a row has no day heading and no date of its own. */
  sheetDate?: string | null
  /** IANA zone the printed times are in (the FBO's local zone), e.g. "America/Phoenix". */
  timeZone: string
}

export const QUICK_TURN_MAX_MINUTES = 60
const LONG_ROLLOVER_MINUTES = 12 * 60

// Board service keys (the 15 seed rows of the B26 catalog) and the printed words that mean them.
const SERVICE_PATTERNS: [key: string, pattern: RegExp][] = [
  ['fuel', /\b(fuel|jet\s*-?a|avgas|100ll|top\s*-?off|prist)\b|\bt\/o\b/i],
  ['gpu', /\b(gpu|ground\s*power|external\s*power)\b/i],
  ['lav', /\b(lav|lavatory)\b/i],
  ['catering', /\bcater(ing)?\b/i],
  ['oxygen', /\b(o2|oxygen)\b/i],
  ['hangar', /\b(hangar|hgr)\b/i],
  ['courtesy_car', /\b(courtesy\s*car|crew\s*car)\b/i],
  ['rental_car', /\brental\b/i],
  ['coffee', /\bcoffee\b/i],
  ['ice', /\bice\b/i],
  ['dishes', /\bdishes\b/i],
  ['cleaning', /\b(clean(ing)?|detail(ing)?)\b/i],
  ['maintenance', /\b(maint(enance)?|mx)\b/i],
  ['ground_transport', /\b(ground\s*transport(ation)?|transport(ation)?|shuttle|limo)\b/i]
]

/** Splits services text on , ; | and newlines; returns recognised catalog keys and the tokens that matched none. */
export function parseServices(text: string): { keys: string[]; unmatched: string[] } {
  const keys: string[] = []
  const unmatched: string[] = []
  for (const token of text.split(/[,;|\n]+/).map((t) => t.trim())) {
    if (!token || isBlankToken(token)) continue
    const hits = SERVICE_PATTERNS.filter(([, re]) => re.test(token)).map(([k]) => k)
    if (hits.length === 0) unmatched.push(token)
    for (const k of hits) if (!keys.includes(k)) keys.push(k)
  }
  return { keys, unmatched }
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function yearOf(date: string | null | undefined): number | undefined {
  const m = date?.match(/^(\d{4})-/)
  return m ? Number(m[1]) : undefined
}

export function mapExtractedRowToFlightDraft(
  row: ExtractedScheduleRow,
  { sheetDate = null, timeZone }: MapRowOptions
): ScheduleFlightDraft {
  const reasons: ScheduleReviewReason[] = []
  const flag = (r: ScheduleReviewReason) => {
    if (!reasons.includes(r)) reasons.push(r)
  }

  if (row.needs_review) flag('model_flagged')
  if (row.confidence === 'low') flag('low_confidence')

  // Tail
  const tail = normalizeTail(row.tail_number)
  if (!tail) flag('missing_tail')
  else if (!isPlausibleTail(tail)) flag('suspicious_tail')

  // Aircraft type: the printed Type column is front-desk free text and is NOT trusted or mapped. It is kept as
  // `aircraftTypeRaw` for display ("as printed"); the type comes from the registry lookup by tail (B45b review).
  const typeRaw = str(row.aircraft_type)

  // Dates. A time without its own date inherits the day heading, then the sheet date.
  const defaultYear = yearOf(parseDate(row.group_date)) ?? yearOf(sheetDate)
  const explicit = (raw: string): string | null | 'bad' => {
    if (isBlankToken(raw)) return null
    return parseDate(raw, defaultYear) ?? 'bad'
  }
  const headerDate = explicit(row.group_date)
  const inherited = headerDate && headerDate !== 'bad' ? headerDate : (sheetDate ?? null)
  if (headerDate === 'bad') flag('unparseable_date')
  const arrDateExplicit = explicit(row.arrival_date)
  const depDateExplicit = explicit(row.departure_date)
  if (arrDateExplicit === 'bad' || depDateExplicit === 'bad') flag('unparseable_date')

  const arrTimeRaw = isBlankToken(row.arrival_time) ? null : row.arrival_time
  const depTimeRaw = isBlankToken(row.departure_time) ? null : row.departure_time
  let arrTime = arrTimeRaw === null ? null : parseTime(arrTimeRaw)
  let depTime = depTimeRaw === null ? null : parseTime(depTimeRaw)
  if (arrTimeRaw !== null && arrTime === null) flag('unparseable_time')
  if (depTimeRaw !== null && depTime === null) flag('unparseable_time')

  const arrDate = arrDateExplicit && arrDateExplicit !== 'bad' ? arrDateExplicit : inherited
  // A departure with no date of its own is on the arrival's date (then rolled forward if it would precede it).
  const depDateIsExplicit = !!depDateExplicit && depDateExplicit !== 'bad'
  let depDate = depDateIsExplicit ? (depDateExplicit as string) : arrDate

  if (arrDateExplicit && arrDateExplicit !== 'bad' && arrTime === null && arrTimeRaw === null) flag('date_without_time')
  if (depDateIsExplicit && depTime === null && depTimeRaw === null) flag('date_without_time')

  if (arrTime !== null && !arrDate) {
    flag('missing_date')
    arrTime = null
  }
  if (depTime !== null && !depDate) {
    flag('missing_date')
    depTime = null
  }

  // Midnight rollover: both times, departure's date inferred, and its wall time is earlier than the arrival's.
  let rolled = false
  if (arrTime !== null && depTime !== null && arrDate && !depDateIsExplicit) {
    if (minutesOfDay(depTime) < minutesOfDay(arrTime)) {
      depDate = addDaysToDateString(arrDate, 1)
      rolled = true
    }
  }

  const arrival = arrTime !== null && arrDate ? zonedWallTimeToInstant(arrDate, arrTime, timeZone) : null
  let departure = depTime !== null && depDate ? zonedWallTimeToInstant(depDate, depTime, timeZone) : null
  for (const z of [arrival, departure]) {
    if (z?.status === 'ambiguous') flag('ambiguous_local_time')
    if (z?.status === 'nonexistent') flag('nonexistent_local_time')
  }

  let isQuickTurn = false
  if (arrival && departure) {
    const gapMin = (departure.instantMs - arrival.instantMs) / 60000
    if (gapMin < 0) {
      // Only reachable when the departure date was printed: never guess a fix, drop the departure for a human to re-enter.
      flag('departure_before_arrival')
      departure = null
    } else {
      if (gapMin === 0) flag('zero_gap')
      if (rolled && gapMin > LONG_ROLLOVER_MINUTES) flag('rolled_over_long_gap')
      isQuickTurn = gapMin <= QUICK_TURN_MAX_MINUTES && gapMin > 0
    }
  }

  const direction: ScheduleDirection =
    arrival && departure ? 'both' : arrival ? 'arrival_only' : departure ? 'departure_only' : 'none'
  if (direction === 'none') flag('no_times')

  const { keys, unmatched } = parseServices(row.services ?? '')
  const notes = [str(row.notes), unmatched.length ? `Services: ${unmatched.join(', ')}` : '']
    .filter(Boolean)
    .join('; ')

  return {
    tailNumber: tail,
    aircraftTypeRaw: typeRaw,
    customer: str(row.customer).replace(/\s+/g, ' '),
    scheduledArrivalTime: arrival?.iso ?? null,
    scheduledDepartureTime: departure?.iso ?? null,
    isQuickTurn,
    direction,
    services: keys,
    notes,
    rawRowText: str(row.raw_row_text),
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    importable: !!tail && direction !== 'none'
  }
}
