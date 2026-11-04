// Duplicate detection for the schedule sheet import (BACKLOG B45a; rules in docs/PLAN.md "B45 Schedule sheet import design").
// Pure: callers pass the existing flights (e.g. flights.repo findAllFlights over the sheet's date range, plus
// drafts already accepted in the same import so a sheet that lists a tail twice cannot double-add).

import { normalizeTail } from './normalize'
import type {
  DuplicateFieldDiff,
  DuplicateResult,
  ExistingFlightLike,
  ScheduleFlightDraft
} from './types'

export const DEFAULT_DUPLICATE_WINDOW_MINUTES = 120

const MINUTE_MS = 60_000

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** Distances in ms between matching scheduled times (arrival-arrival, departure-departure): `min` decides eligibility, `sum` ranks candidates. Null when none are comparable. */
function timeDistance(draft: ScheduleFlightDraft, f: ExistingFlightLike): { min: number; sum: number } | null {
  const pairs: [number | null, number | null][] = [
    [ms(draft.scheduledArrivalTime), ms(f.scheduled_arrival_time)],
    [ms(draft.scheduledDepartureTime), ms(f.scheduled_departure_time)]
  ]
  const distances = pairs.filter(([a, b]) => a !== null && b !== null).map(([a, b]) => Math.abs((a as number) - (b as number)))
  return distances.length ? { min: Math.min(...distances), sum: distances.reduce((a, b) => a + b, 0) } : null
}

function compareTime(
  field: 'scheduled_arrival_time' | 'scheduled_departure_time',
  incoming: string | null,
  existing: string | null,
  fills: DuplicateFieldDiff[],
  conflicts: DuplicateFieldDiff[]
) {
  const inc = ms(incoming)
  if (inc === null || !incoming) return // the sheet says nothing about this time
  const ex = ms(existing)
  if (ex === null) fills.push({ field, existing: existing ?? null, incoming })
  else if (Math.abs(inc - ex) >= MINUTE_MS) conflicts.push({ field, existing, incoming })
}

/**
 * Finds the existing flight a drafted sheet row most likely already is: same tail (case/space/dash-insensitive) and a
 * scheduled arrival or departure within `windowMinutes` of the draft's. Soft-deleted flights are ignored; cancelled
 * ones still match so a re-import never silently resurrects them.
 *
 * Suggestion: 'add' (no match), 'update' (the match has empty fields the sheet can fill), otherwise 'skip'.
 * Values already set on the board are never overwritten: differences are reported in `conflicts` and left to the user.
 * Re-importing a sheet that was already imported therefore yields zero 'add' suggestions.
 */
export function findDuplicateFlight<F extends ExistingFlightLike>(
  draft: ScheduleFlightDraft,
  existingFlights: readonly F[],
  { windowMinutes = DEFAULT_DUPLICATE_WINDOW_MINUTES }: { windowMinutes?: number } = {}
): DuplicateResult<F> {
  const tail = normalizeTail(draft.tailNumber)
  const windowMs = windowMinutes * MINUTE_MS

  let match: F | null = null
  let best = Number.POSITIVE_INFINITY
  let candidateCount = 0
  if (tail) {
    for (const f of existingFlights) {
      if (f.deleted_at || normalizeTail(f.aircraft_id) !== tail) continue
      const d = timeDistance(draft, f)
      if (d === null || d.min > windowMs) continue
      candidateCount++
      if (d.sum < best) {
        best = d.sum
        match = f
      }
    }
  }

  if (!match) return { match: null, suggestion: 'add', fills: [], conflicts: [], candidateCount: 0 }

  const fills: DuplicateFieldDiff[] = []
  const conflicts: DuplicateFieldDiff[] = []
  compareTime('scheduled_arrival_time', draft.scheduledArrivalTime, match.scheduled_arrival_time, fills, conflicts)
  compareTime('scheduled_departure_time', draft.scheduledDepartureTime, match.scheduled_departure_time, fills, conflicts)

  const incomingName = draft.customer.trim()
  const existingName = (match.contact_name ?? '').trim()
  if (incomingName) {
    if (!existingName) fills.push({ field: 'contact_name', existing: match.contact_name ?? null, incoming: incomingName })
    else if (existingName.toLowerCase() !== incomingName.toLowerCase()) {
      conflicts.push({ field: 'contact_name', existing: existingName, incoming: incomingName })
    }
  }

  const existingServices = match.services ?? []
  const missing = draft.services.filter((k) => !existingServices.includes(k))
  if (missing.length) fills.push({ field: 'services', existing: [...existingServices], incoming: missing })

  return { match, suggestion: fills.length ? 'update' : 'skip', fills, conflicts, candidateCount }
}
