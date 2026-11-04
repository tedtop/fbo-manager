// Pure field parsers and the model-output sanitizer for the schedule sheet import. No SDK, no network.

import type {
  ExtractedScheduleRow,
  ExtractedScheduleSheet,
  ExtractionConfidence
} from './types'

// Printed placeholders that mean "no value" (e.g. departure not known yet). Not an error.
const BLANK_TOKENS = new Set(['', '-', '--', '---', '—', '–', '?', 'tbd', 'unk', 'unknown', 'n/a', 'na', 'none'])

export function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

export function isBlankToken(v: unknown): boolean {
  return BLANK_TOKENS.has(str(v).toLowerCase())
}

/** "N 116 FE" -> "N116FE"; OCR letter-case noise removed. */
export function normalizeTail(v: unknown): string {
  return str(v).toUpperCase().replace(/[\s\-.·]/g, '')
}

// FAA N-number: N + 1-5 chars, first digit 1-9; up to 5 digits, or up to 4 digits + 1 letter, or up to 3 digits + 2 letters; letters exclude I and O.
const N_NUMBER = /^N[1-9](\d{0,4}|\d{0,3}[A-HJ-NP-Z]|\d{0,2}[A-HJ-NP-Z]{2})$/
const FOREIGN_REG = /^[A-Z0-9]{3,7}$/

/** True when a normalized tail is a plausible registration. N-prefixed tails must be a real N-number shape. */
export function isPlausibleTail(tail: string): boolean {
  if (!tail) return false
  if (tail.startsWith('N')) return N_NUMBER.test(tail)
  return FOREIGN_REG.test(tail) && /[A-Z]/.test(tail)
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const WEEKDAY_PREFIX = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i

/**
 * Parses a printed date to "YYYY-MM-DD", or null when unparseable/not a real calendar date.
 * Accepts ISO, and US month-first M/D/YYYY, M/D/YY and M/D (needs `defaultYear`), with an optional weekday prefix.
 */
export function parseDate(v: unknown, defaultYear?: number): string | null {
  const s = str(v).replace(WEEKDAY_PREFIX, '')
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return isRealDate(y, mo, d) ? `${m[1]}-${pad2(mo)}-${pad2(d)}` : null
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/)
  if (m) {
    const mo = Number(m[1])
    const d = Number(m[2])
    let y: number
    if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    else if (defaultYear) y = defaultYear
    else return null
    return isRealDate(y, mo, d) ? `${String(y).padStart(4, '0')}-${pad2(mo)}-${pad2(d)}` : null
  }
  return null
}

/** Parses a printed time to 24 h "HH:mm", or null. "0545", "545", "5:45", "17:45", "5:45 PM", "5:45p", "1745L". */
export function parseTime(v: unknown): string | null {
  const s = str(v).toLowerCase().replace(/\s+/g, '')
  const m = s.match(/^(\d{1,2}):?(\d{2})(a|p|am|pm)?(l|lcl|local)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  if (min > 59) return null
  const meridiem = m[3]?.[0]
  if (meridiem) {
    if (h < 1 || h > 12) return null
    if (meridiem === 'a') h = h === 12 ? 0 : h
    else h = h === 12 ? 12 : h + 12
  } else if (h > 23) {
    return null
  }
  return `${pad2(h)}:${pad2(min)}`
}

// Date/time cleanup for the extraction output: canonical form when parseable, trimmed verbatim text otherwise
// (the mapper turns leftovers into unparseable_* review reasons), '' for blank/placeholder tokens.
function cleanDate(v: unknown, defaultYear?: number): string {
  if (isBlankToken(v)) return ''
  return parseDate(v, defaultYear) ?? str(v)
}

function cleanTime(v: unknown): string {
  if (isBlankToken(v)) return ''
  return parseTime(v) ?? str(v)
}

function yearOf(date: string | null): number | undefined {
  const m = date?.match(/^(\d{4})-/)
  return m ? Number(m[1]) : undefined
}

function isConfidence(v: unknown): v is ExtractionConfidence {
  return v === 'high' || v === 'medium' || v === 'low'
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Turns whatever JSON the model returned into a well-formed ExtractedScheduleSheet. Never throws. */
export function normalizeScheduleSheet(parsed: unknown, rawText?: string): ExtractedScheduleSheet {
  const p = asRecord(parsed)
  const sheetDate = isBlankToken(p.sheet_date) ? null : (parseDate(p.sheet_date) ?? null)
  const rangeStart = isBlankToken(p.date_range_start) ? null : (parseDate(p.date_range_start) ?? null)
  const rangeEnd = isBlankToken(p.date_range_end) ? null : (parseDate(p.date_range_end) ?? null)
  const defaultYear = yearOf(sheetDate) ?? yearOf(rangeStart) ?? yearOf(rangeEnd)

  const rawRows = Array.isArray(p.rows) ? p.rows : []
  const rows: ExtractedScheduleRow[] = []
  for (const item of rawRows) {
    const r = asRecord(item)
    const row: ExtractedScheduleRow = {
      tail_number: normalizeTail(r.tail_number),
      aircraft_type: str(r.aircraft_type).toUpperCase(),
      customer: str(r.customer).replace(/\s+/g, ' '),
      group_date: cleanDate(r.group_date, defaultYear),
      arrival_date: cleanDate(r.arrival_date, defaultYear),
      arrival_time: cleanTime(r.arrival_time),
      departure_date: cleanDate(r.departure_date, defaultYear),
      departure_time: cleanTime(r.departure_time),
      services: str(r.services),
      notes: str(r.notes),
      raw_row_text: str(r.raw_row_text),
      needs_review: r.needs_review === true,
      confidence: isConfidence(r.confidence) ? r.confidence : 'medium',
      page: Number.isInteger(r.page) && (r.page as number) > 0 ? (r.page as number) : 1
    }
    // A row with nothing identifying on it is a blank/decoration line, not a flight.
    const hasContent =
      row.tail_number || row.arrival_time || row.departure_time || row.customer || row.raw_row_text
    if (hasContent) rows.push(row)
  }

  return {
    sheet_date: sheetDate,
    date_range_start: rangeStart,
    date_range_end: rangeEnd,
    source_software_hint: str(p.source_software_hint),
    rows,
    ...(rawText !== undefined ? { raw_text: rawText } : {})
  }
}

/** Merges per-file extractions (multi-photo upload) into one sheet; rows keep upload order and get their file number as `page`. */
export function mergeScheduleSheets(sheets: ExtractedScheduleSheet[]): ExtractedScheduleSheet {
  const dates = sheets
    .flatMap((s) => [s.sheet_date, s.date_range_start, s.date_range_end])
    .filter((d): d is string => !!d)
    .sort()
  const hasRange = sheets.some((s) => s.date_range_start || s.date_range_end)
  const distinct = new Set(dates)
  const single = !hasRange && distinct.size === 1
  const rawTexts = sheets.map((s) => s.raw_text).filter((t): t is string => t !== undefined)
  return {
    // One printed date stays a sheet_date; anything wider becomes a range.
    sheet_date: single ? dates[0] : null,
    date_range_start: !single && dates.length ? dates[0] : null,
    date_range_end: !single && dates.length ? (dates.at(-1) ?? null) : null,
    source_software_hint: sheets.map((s) => s.source_software_hint).find((h) => h) ?? '',
    rows: sheets.flatMap((s, i) => s.rows.map((r) => ({ ...r, page: i + 1 }))),
    ...(rawTexts.length ? { raw_text: rawTexts.join('\n\n---\n\n') } : {})
  }
}
