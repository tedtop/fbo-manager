// Review-screen state for the schedule sheet import (BACKLOG B45b; contract in docs/PLAN.md "B45 Schedule sheet import
// design", section 5). Pure: the hook and components only hold this state and call these functions.
//
//   sheet -> pairSingleLegRows -> mapExtractedRowToFlightDraft -> ScheduleReviewItem (editable)
//   items + existing flights -> evaluateReviewItems -> per-row evaluation (times, QT, reasons, duplicate, plan)
//   items + evaluations -> planImport -> add / fill-update operations for the hook to write through flights.repo

import type { AirportLike } from '@/lib/airports'
import { findIcaoType, formatIcaoType } from '@/lib/icao-aircraft-types'
import { mapExtractedRowToFlightDraft, QUICK_TURN_MAX_MINUTES } from './map-row'
import { isPlausibleTail, normalizeTail } from './normalize'
import { pairSingleLegRows } from './pair-legs'
import { type AirportChoice, resolveAirportChoice } from './resolve-airport'
import { matchPrintedType } from './resolve-type'
import { findDuplicateFlight } from './duplicates'
import type {
  DuplicateResult,
  DuplicateSuggestion,
  ExistingFlightLike,
  ExtractedScheduleRow,
  ExtractedScheduleSheet,
  ScheduleDirection,
  ScheduleFlightDraft,
  ScheduleReviewReason
} from './types'
import { addDaysToDateString, zonedWallTimeToInstant } from './zoned-time'

/** The FBO is in Missoula, Montana. The app has no configured zone yet (see PLAN B45 "Time zone"). */
export const SCHEDULE_TIME_ZONE = 'America/Denver'

export interface WallTime {
  date: string // "YYYY-MM-DD" or ''
  time: string // "HH:mm" or ''
}

export interface ScheduleReviewItem {
  id: string
  /** The printed row(s) behind this flight: 2 when two legs were paired, else 1. */
  sourceRows: ExtractedScheduleRow[]
  /** The mapper's output for the row as extracted (reasons, services mapping). Edits live in the fields below. */
  draft: ScheduleFlightDraft
  tail: string
  /** The Type column as printed: front-desk free text, never trusted. Shown as "as printed" and offered as a suggestion. */
  typePrinted: string
  /** The user's own type for this aircraft (an ICAO code or free text); null = use the registry lookup by tail. */
  typeOverride: string | null
  /** Origin / destination as printed (code or place name), '' when the sheet has none. */
  originPrinted: string
  destinationPrinted: string
  /** The user's pick from the airport combobox (a stored code, '' = none); null = what the printed text resolves to. */
  originOverride: string | null
  destinationOverride: string | null
  customer: string
  arrival: WallTime
  departure: WallTime
  services: string[]
  notes: string
  /** null = default (included unless the duplicate suggestion is skip). */
  includeOverride: boolean | null
  /** null = the duplicate check's suggestion. */
  actionOverride: DuplicateSuggestion | null
  /** The user cleared the review reasons of this row. */
  acknowledged: boolean
}

/** What the review screen needs from an existing board flight. */
export interface ReviewExistingFlight extends ExistingFlightLike {
  updated_at?: string | null
  notes?: string | null
}

/** Result of the registry lookup (adsbdb via /api/aircraft/lookup) for one tail. */
export type TailTypeLookup =
  | { state: 'pending' }
  | { state: 'found'; icao: string; display: string }
  | { state: 'none' }

export type TypeSource = 'override' | 'registry' | 'printed' | 'none'

/**
 * The aircraft type to use, in priority order: the user's choice, the registry lookup by tail (adsbdb returns an ICAO
 * designator), the printed Type text when it names exactly one ICAO type (matchPrintedType), else unresolved (the user
 * picks one in the card; the import still allows it as UNKN). The printed text is only tried once the lookup has
 * finished without an answer: a running lookup (pending) wins the wait.
 */
export function resolveAircraftType(
  override: string | null,
  lookup: TailTypeLookup | undefined,
  printed = ''
): { icao: string | null; display: string; source: TypeSource } {
  const typed = (override ?? '').trim()
  if (typed) {
    const hit = findIcaoType(typed.replace(/[\s-]/g, ''))
    return hit ? { icao: hit.icao, display: formatIcaoType(hit), source: 'override' } : { icao: null, display: typed, source: 'override' }
  }
  if (lookup?.state === 'found') return { icao: lookup.icao, display: lookup.display, source: 'registry' }
  if (lookup?.state !== 'pending') {
    const guess = matchPrintedType(printed)
    if (guess) return { icao: guess.icao, display: formatIcaoType(guess), source: 'printed' }
  }
  return { icao: null, display: '', source: 'none' }
}

export type PlannedAction = 'add' | 'update' | 'skip'

export interface ReviewEvaluation {
  arrivalIso: string | null
  departureIso: string | null
  isQuickTurn: boolean
  direction: ScheduleDirection
  /** Resolved type (see resolveAircraftType); icao null when free text or nothing. */
  typeIcao: string | null
  typeDisplay: string
  typeSource: TypeSource
  /** No ICAO type yet (nothing found, or free text): the card asks the user to pick one. */
  typeUnresolved: boolean
  /** Origin / destination: the stored code to write, how the printed text resolved, or that the user must pick. */
  origin: AirportChoice
  destination: AirportChoice
  /** The tail's registry lookup is still running. */
  lookupPending: boolean
  /** The reasons that apply to the CURRENT (edited) values. */
  reasons: ScheduleReviewReason[]
  needsReview: boolean
  importable: boolean
  dup: DuplicateResult<ReviewExistingFlight>
  /** The match is another row of this same sheet, not a board flight. */
  matchIsSheetRow: boolean
  include: boolean
  /** What happens at import: skip when not included. */
  plan: PlannedAction
  /** Included but flagged and not acknowledged yet: blocks the import button. */
  blocking: boolean
}

let counter = 0
function nextItemId(): string {
  counter += 1
  return `sched-${counter}`
}

function wallOf(iso: string | null): WallTime {
  return iso ? { date: iso.slice(0, 10), time: iso.slice(11, 16) } : { date: '', time: '' }
}

function itemFrom(sourceRows: ExtractedScheduleRow[], row: ExtractedScheduleRow, sheetDate: string | null, timeZone: string): ScheduleReviewItem {
  const draft = mapExtractedRowToFlightDraft(row, { sheetDate, timeZone })
  return {
    id: nextItemId(),
    sourceRows,
    draft,
    tail: draft.tailNumber,
    typePrinted: draft.aircraftTypeRaw,
    typeOverride: null,
    originPrinted: draft.originRaw,
    destinationPrinted: draft.destinationRaw,
    originOverride: null,
    destinationOverride: null,
    customer: draft.customer,
    arrival: wallOf(draft.scheduledArrivalTime),
    departure: wallOf(draft.scheduledDepartureTime),
    services: [...draft.services],
    notes: draft.notes,
    includeOverride: null,
    actionOverride: null,
    acknowledged: false
  }
}

/** Extracted sheet -> editable review items: single-leg rows are paired first, then every row is mapped. */
export function buildReviewItems(
  sheet: ExtractedScheduleSheet,
  { timeZone = SCHEDULE_TIME_ZONE }: { timeZone?: string } = {}
): ScheduleReviewItem[] {
  return pairSingleLegRows(sheet.rows).map(({ row, sourceRows }) => itemFrom(sourceRows, row, sheet.sheet_date, timeZone))
}

/** Undoes a pairing: the item becomes one item per printed row, in printed order. Unpaired items come back unchanged. */
export function unpairItem(
  item: ScheduleReviewItem,
  sheetDate: string | null,
  { timeZone = SCHEDULE_TIME_ZONE }: { timeZone?: string } = {}
): ScheduleReviewItem[] {
  if (item.sourceRows.length < 2) return [item]
  return item.sourceRows.map((r) => itemFrom([r], r, sheetDate, timeZone))
}

function wallToIso(w: WallTime, timeZone: string): { iso: string; instantMs: number; status: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date) || !/^\d{2}:\d{2}$/.test(w.time)) return null
  const z = zonedWallTimeToInstant(w.date, w.time, timeZone)
  return { iso: z.iso, instantMs: z.instantMs, status: z.status }
}

// Reasons the mapper derived from the printed values and that editing can change: they are recomputed from the
// current values instead. Everything else (model_flagged, low_confidence, ambiguous/nonexistent time...) is kept.
const RECOMPUTED: ScheduleReviewReason[] = [
  'missing_tail',
  'suspicious_tail',
  'missing_date',
  'unparseable_date',
  'unparseable_time',
  'date_without_time',
  'no_times',
  'departure_before_arrival',
  'rolled_over_long_gap',
  'zero_gap'
]

/** The draft the duplicate check and the import work from: the item's CURRENT (edited) values. */
export function currentDraft(item: ScheduleReviewItem, timeZone: string): ScheduleFlightDraft & { reasons: ScheduleReviewReason[] } {
  const tail = normalizeTail(item.tail)
  const arr = wallToIso(item.arrival, timeZone)
  let dep = wallToIso(item.departure, timeZone)
  const reasons: ScheduleReviewReason[] = item.draft.reviewReasons.filter((r) => !RECOMPUTED.includes(r))
  const flag = (r: ScheduleReviewReason) => {
    if (!reasons.includes(r)) reasons.push(r)
  }

  if (!tail) flag('missing_tail')
  else if (!isPlausibleTail(tail)) flag('suspicious_tail')

  for (const w of [item.arrival, item.departure]) {
    if (w.time && !w.date) flag('missing_date')
    else if (w.date && !w.time) flag('date_without_time')
    else if (w.time && !/^\d{2}:\d{2}$/.test(w.time)) flag('unparseable_time')
    else if (w.date && !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) flag('unparseable_date')
  }

  let isQuickTurn = false
  if (arr && dep) {
    const gapMin = (dep.instantMs - arr.instantMs) / 60000
    if (gapMin < 0) {
      flag('departure_before_arrival')
      dep = null
    } else {
      if (gapMin === 0) flag('zero_gap')
      isQuickTurn = gapMin > 0 && gapMin <= QUICK_TURN_MAX_MINUTES
    }
  }

  const direction: ScheduleDirection = arr && dep ? 'both' : arr ? 'arrival_only' : dep ? 'departure_only' : 'none'
  if (direction === 'none') flag('no_times')

  return {
    tailNumber: tail,
    aircraftTypeRaw: item.typePrinted,
    originRaw: item.originPrinted,
    destinationRaw: item.destinationPrinted,
    customer: item.customer.trim(),
    scheduledArrivalTime: arr?.iso ?? null,
    scheduledDepartureTime: dep?.iso ?? null,
    isQuickTurn,
    direction,
    services: [...item.services],
    notes: item.notes.trim(),
    rawRowText: item.draft.rawRowText,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    importable: !!tail && direction !== 'none',
    reasons
  }
}

const PENDING = 'pending-'

/**
 * Evaluates every item against the board's flights (existing) and, in order, against the earlier rows of the same sheet
 * that will be added, so a flight listed twice is added once. Pure: call it on every state change.
 */
export function evaluateReviewItems(
  items: readonly ScheduleReviewItem[],
  existing: readonly ReviewExistingFlight[],
  {
    timeZone = SCHEDULE_TIME_ZONE,
    lookups = {},
    airports = [],
    homeCountry
  }: {
    timeZone?: string
    lookups?: Readonly<Record<string, TailTypeLookup>>
    /** The airport table rows for the printed codes (see airportCodeToLookUp). */
    airports?: readonly AirportLike[]
    homeCountry?: string
  } = {}
): ReviewEvaluation[] {
  const pool: ReviewExistingFlight[] = [...existing]
  const out: ReviewEvaluation[] = []

  for (const item of items) {
    const d = currentDraft(item, timeZone)
    const dup = findDuplicateFlight(d, pool)
    const matchIsSheetRow = dup.match ? String(dup.match.id).startsWith(PENDING) : false
    // A match with another row of this sheet is never an update target: that row is the one that gets added.
    const suggestion: DuplicateSuggestion = matchIsSheetRow ? 'skip' : dup.suggestion
    let action: DuplicateSuggestion = item.actionOverride ?? suggestion
    if (action === 'update' && (!dup.match || matchIsSheetRow)) action = 'add'
    if (action === 'update' && dup.match && !matchIsSheetRow && dup.fills.length === 0) action = 'skip' // nothing to fill

    const include = d.importable && (item.includeOverride ?? suggestion !== 'skip')
    const plan: PlannedAction = include && action !== 'skip' ? action : 'skip'
    const blocking = plan !== 'skip' && d.needsReview && !item.acknowledged
    const lookup = d.tailNumber ? lookups[d.tailNumber] : undefined
    const type = resolveAircraftType(item.typeOverride, lookup, item.typePrinted)
    const airportOpts = { homeCountry }

    out.push({
      arrivalIso: d.scheduledArrivalTime,
      departureIso: d.scheduledDepartureTime,
      isQuickTurn: d.isQuickTurn,
      direction: d.direction,
      typeIcao: type.icao,
      typeDisplay: type.display,
      typeSource: type.source,
      typeUnresolved: type.icao === null,
      origin: resolveAirportChoice(item.originPrinted, item.originOverride, airports, airportOpts),
      destination: resolveAirportChoice(item.destinationPrinted, item.destinationOverride, airports, airportOpts),
      lookupPending: lookup?.state === 'pending' && !item.typeOverride?.trim(),
      reasons: d.reasons,
      needsReview: d.needsReview,
      importable: d.importable,
      dup,
      matchIsSheetRow,
      include,
      plan,
      blocking
    })

    if (plan === 'add') {
      pool.push({
        id: `${PENDING}${item.id}`,
        tail_number: d.tailNumber,
        scheduled_arrival_time: d.scheduledArrivalTime,
        scheduled_departure_time: d.scheduledDepartureTime,
        contact_name: d.customer,
        services: d.services
      })
    }
  }
  return out
}

export interface ImportSummary {
  add: number
  update: number
  skip: number
  blocking: number
  /** Rows to add whose type lookup is still running. */
  lookupsPending: number
}

export function summarizeReview(evals: readonly ReviewEvaluation[]): ImportSummary {
  const s: ImportSummary = { add: 0, update: 0, skip: 0, blocking: 0, lookupsPending: 0 }
  for (const e of evals) {
    s[e.plan] += 1
    if (e.blocking) s.blocking += 1
    if (e.plan === 'add' && e.lookupPending) s.lookupsPending += 1
  }
  return s
}

/** The import button is enabled when something will be written and nothing flagged is unacknowledged. */
export function canImport(evals: readonly ReviewEvaluation[]): boolean {
  const s = summarizeReview(evals)
  return s.add + s.update > 0 && s.blocking === 0 && s.lookupsPending === 0
}

/** Calendar span the board lookup should cover (inclusive local dates, padded one day), or null when no row has a date. */
export function existingFlightsRange(items: readonly ScheduleReviewItem[]): { startDate: string; endDate: string } | null {
  const dates = items.flatMap((i) => [i.arrival.date, i.departure.date]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (dates.length === 0) return null
  return { startDate: addDaysToDateString(dates[0], -1), endDate: addDaysToDateString(dates[dates.length - 1], 1) }
}

export interface AddOperation {
  kind: 'add'
  itemId: string
  tailNumber: string
  aircraftTypeDisplay: string
  aircraftTypeIcao: string
  insert: {
    tail_number: string
    scheduled_arrival_time: string | null
    scheduled_departure_time: string | null
    is_quick_turn: boolean
    flight_status: 'scheduled'
    origin: string
    destination: string
    contact_name: string
    contact_notes: string
    services: string[]
    fuel_order_notes: string
    notes: string
    created_by_source: 'front-desk'
  }
  serviceKeys: string[]
}

export interface UpdateOperation {
  kind: 'update'
  itemId: string
  flightId: number
  expectedUpdatedAt: string | undefined
  /** Only fields the board had empty (D12). Never overwrites. */
  updates: {
    scheduled_arrival_time?: string
    scheduled_departure_time?: string
    contact_name?: string
    notes?: string
    is_quick_turn?: boolean
  }
  /** Existing services plus the sheet's missing ones; null when nothing to add. */
  serviceKeys: string[] | null
}

export type ImportOperation = AddOperation | UpdateOperation

function minutesBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 60000
}

/** Turns the reviewed items into the writes to make. Skipped rows produce nothing. */
export function planImport(
  items: readonly ScheduleReviewItem[],
  evals: readonly ReviewEvaluation[],
  { timeZone = SCHEDULE_TIME_ZONE }: { timeZone?: string } = {}
): ImportOperation[] {
  const ops: ImportOperation[] = []
  items.forEach((item, i) => {
    const ev = evals[i]
    if (!ev || ev.plan === 'skip') return
    const d = currentDraft(item, timeZone)

    if (ev.plan === 'add') {
      ops.push({
        kind: 'add',
        itemId: item.id,
        tailNumber: d.tailNumber,
        aircraftTypeDisplay: ev.typeDisplay || 'Unknown',
        aircraftTypeIcao: ev.typeIcao ?? 'UNKN',
        insert: {
          tail_number: d.tailNumber,
          scheduled_arrival_time: d.scheduledArrivalTime,
          scheduled_departure_time: d.scheduledDepartureTime,
          is_quick_turn: d.isQuickTurn,
          flight_status: 'scheduled',
          origin: ev.origin.code ?? '',
          destination: ev.destination.code ?? '',
          contact_name: d.customer,
          contact_notes: '',
          services: [],
          fuel_order_notes: '',
          notes: d.notes,
          created_by_source: 'front-desk'
        },
        serviceKeys: d.services
      })
      return
    }

    const match = ev.dup.match
    if (!match || ev.matchIsSheetRow) return
    const updates: UpdateOperation['updates'] = {}
    let serviceKeys: string[] | null = null
    for (const fill of ev.dup.fills) {
      if (fill.field === 'scheduled_arrival_time') updates.scheduled_arrival_time = fill.incoming as string
      else if (fill.field === 'scheduled_departure_time') updates.scheduled_departure_time = fill.incoming as string
      else if (fill.field === 'contact_name') updates.contact_name = fill.incoming as string
      else if (fill.field === 'services') serviceKeys = [...new Set([...(match.services ?? []), ...(fill.incoming as string[])])]
    }
    if (d.notes && !(match.notes ?? '').trim()) updates.notes = d.notes
    const arr = updates.scheduled_arrival_time ?? match.scheduled_arrival_time
    const dep = updates.scheduled_departure_time ?? match.scheduled_departure_time
    if ((updates.scheduled_arrival_time || updates.scheduled_departure_time) && arr && dep) {
      const gap = minutesBetween(arr, dep)
      updates.is_quick_turn = gap > 0 && gap <= QUICK_TURN_MAX_MINUTES
    }
    if (Object.keys(updates).length === 0 && !serviceKeys) return
    ops.push({
      kind: 'update',
      itemId: item.id,
      flightId: Number(match.id),
      expectedUpdatedAt: match.updated_at ?? undefined,
      updates,
      serviceKeys
    })
  })
  return ops
}
