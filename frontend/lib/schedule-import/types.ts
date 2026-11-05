// Types for the front-desk schedule sheet import (BACKLOG B45, docs/PLAN.md "B45 Schedule sheet import design").
// Pure module: no SDK, no Supabase.

export type ExtractionConfidence = 'high' | 'medium' | 'low'

/** One printed schedule row exactly as the model read it (after normalizeScheduleSheet cleanup). */
export interface ExtractedScheduleRow {
  tail_number: string // uppercase, no spaces/dashes ("N 116 FE" -> "N116FE"); '' when unreadable
  aircraft_type: string // as printed (ICAO code or free text), uppercase
  customer: string // owner / operator / customer / contact as printed
  /** The printed day heading this row sits under, "YYYY-MM-DD", or '' when the sheet has no day headers. */
  group_date: string
  arrival_date: string // "YYYY-MM-DD" only when printed IN the row, else ''
  arrival_time: string // 24 h "HH:mm", '' when blank; unparseable text is kept verbatim so the mapper can flag it
  departure_date: string
  departure_time: string
  /** Where the aircraft is coming from / going next, as printed (code or place name). Absent or '' when the sheet has no such column. */
  origin?: string
  destination?: string
  services: string // services text as printed (fuel, GPU, lav, catering ...)
  notes: string // remarks / comments column
  raw_row_text: string // the whole row transcribed as one line, for the review screen
  needs_review: boolean // the model's own doubt about this row
  confidence: ExtractionConfidence
  page: number // 1-based source page/file
}

export interface ExtractedScheduleSheet {
  sheet_date: string | null // "YYYY-MM-DD" when the sheet is for one printed date
  date_range_start: string | null // when the sheet covers several days
  date_range_end: string | null
  source_software_hint: string // title/logo/footer text naming the scheduling software, '' if none
  rows: ExtractedScheduleRow[]
  raw_text?: string // for debugging
}

/** Codes explaining why a draft needs a human look. All of them set `needsReview`. */
export type ScheduleReviewReason =
  | 'model_flagged'
  | 'low_confidence'
  | 'missing_tail'
  | 'suspicious_tail'
  | 'missing_date'
  | 'unparseable_date'
  | 'unparseable_time'
  | 'date_without_time'
  | 'no_times'
  | 'departure_before_arrival'
  | 'rolled_over_long_gap'
  | 'zero_gap'
  | 'ambiguous_local_time'
  | 'nonexistent_local_time'

export type ScheduleDirection = 'arrival_only' | 'departure_only' | 'both' | 'none'

/** A flight ready for the review screen; maps 1:1 onto a flights.repo insert (see PLAN.md B45 mapping rules). */
export interface ScheduleFlightDraft {
  tailNumber: string
  aircraftTypeRaw: string // what the sheet printed: unreliable free text, display only (type comes from the tail lookup)
  /** Airports as printed (see ExtractedScheduleRow.origin/destination); '' when not printed. Resolved to a stored code in the review. */
  originRaw: string
  destinationRaw: string
  customer: string // -> flight.contact_name
  scheduledArrivalTime: string | null // ISO 8601 with local offset, e.g. 2026-03-08T09:00:00-07:00
  scheduledDepartureTime: string | null
  isQuickTurn: boolean
  direction: ScheduleDirection
  services: string[] // catalog keys recognised in the services text
  notes: string // sheet remarks plus any services text that matched no key
  rawRowText: string
  needsReview: boolean
  reviewReasons: ScheduleReviewReason[]
  /** false when the flight table could not accept it (no tail or no usable time): the review screen must block it. */
  importable: boolean
}

export const REVIEW_REASON_LABELS: Record<ScheduleReviewReason, string> = {
  model_flagged: 'The scan reader was unsure about this row',
  low_confidence: 'Low reading confidence',
  missing_tail: 'No tail number',
  suspicious_tail: 'Tail number does not look like a valid registration',
  missing_date: 'No date for this row (no day heading or sheet date)',
  unparseable_date: 'A date could not be read',
  unparseable_time: 'A time could not be read',
  date_without_time: 'A date was printed with no time',
  no_times: 'Neither an arrival nor a departure time',
  departure_before_arrival: 'Departure is before arrival',
  rolled_over_long_gap: 'Departure moved to the next day, stay is over 12 hours',
  zero_gap: 'Departure is the same minute as arrival',
  ambiguous_local_time: 'Time occurs twice (clocks go back); the first one was used',
  nonexistent_local_time: 'Time does not exist (clocks spring forward); moved one hour later'
}

/** Minimal structural subset of a flights.repo FlightRow, so tests and callers need no database types. */
export interface ExistingFlightLike {
  id: number | string
  tail_number: string
  scheduled_arrival_time: string | null
  scheduled_departure_time: string | null
  is_quick_turn?: boolean | null
  contact_name?: string | null
  services?: string[] | null
  deleted_at?: string | null
}

export type DuplicateSuggestion = 'add' | 'update' | 'skip'

export interface DuplicateFieldDiff {
  field: 'scheduled_arrival_time' | 'scheduled_departure_time' | 'contact_name' | 'services'
  existing: string | string[] | null
  incoming: string | string[]
}

export interface DuplicateResult<F extends ExistingFlightLike = ExistingFlightLike> {
  match: F | null
  suggestion: DuplicateSuggestion
  /** Incoming values for fields the existing flight has empty: safe to write (suggestion 'update'). */
  fills: DuplicateFieldDiff[]
  /** Fields set on both sides with different values: never written automatically (suggestion stays 'skip'). */
  conflicts: DuplicateFieldDiff[]
  /** How many existing flights were inside the window (the closest one is `match`). */
  candidateCount: number
}
