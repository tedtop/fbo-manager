// Rule-based parser for the Total FBO "Scheduled Arrivals and Requests" report, fed with OCR text (Tesseract or Google
// Vision). Pure: no network, no SDK. Fuzzy on purpose: the text comes from a phone photo ("Arive", "10:00AM" with no
// space, "41/26/2026", clipped customer names, garbage characters to the right and below). It never invents rows: a
// row exists only where a line starts with a date and a time. Suspicious fields set needs_review instead of being guessed.

import { isPlausibleTail, normalizeTail, parseDate, parseTime } from './normalize'
import type { ExtractedScheduleRow, ExtractedScheduleSheet } from './types'

export interface ParsedTotalFbo {
  /** True when the text looks like this report (title or Action-column header, or two or more date/time/action rows). */
  recognised: boolean
  sheet: ExtractedScheduleSheet
  rowCount: number
  needsReviewCount: number
}

// Customers this desk prints often. Used only to repair clipped or misread names ("Cast an", "Custome"), never to add data.
const KNOWN_CUSTOMERS = ['Cash/Check Customer', 'Buybacks-Contract Fuel']

const DIGITISH = '[0-9OolI|]'
const ROW_RE = new RegExp(
  `^\\W*(${DIGITISH}{1,2}[/.]${DIGITISH}{1,2}[/.]${DIGITISH}{4})\\s+(${DIGITISH}{1,2}[:.;]${DIGITISH}{2})\\s*([AaPp]\\.?\\s?[MmNn]?)?(?=\\s|$)\\s*(.*)$`
)
const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/

function digits(s: string): string {
  return s.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1')
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

interface DateFix {
  iso: string | null
  repaired: boolean
  inRange: boolean
}

/** "11/26/2026" -> ISO. When the date is impossible or outside the printed period, tries a single wrong digit ("41/26/2026"). */
function readDate(token: string, range: { start: string | null; end: string | null }): DateFix {
  const text = digits(token)
  const within = (iso: string) => (!range.start || iso >= range.start) && (!range.end || iso <= range.end)
  const direct = parseDate(text)
  if (direct && within(direct)) return { iso: direct, repaired: false, inRange: true }
  if (!range.start && !range.end) return { iso: direct, repaired: false, inRange: true }
  const found = new Set<string>()
  for (let i = 0; i < text.length; i++) {
    if (!/\d/.test(text[i])) continue
    for (let d = 0; d <= 9; d++) {
      const iso = parseDate(text.slice(0, i) + d + text.slice(i + 1))
      if (iso && within(iso)) found.add(iso)
    }
  }
  if (found.size === 1) return { iso: [...found][0], repaired: true, inRange: true }
  return { iso: direct, repaired: false, inRange: false }
}

/** Keep the leading words of an OCR text line, dropping the trailing garbage ("dl TN", "od Bs", "=="). */
function trimJunkTail(tokens: string[]): string[] {
  const out = [...tokens]
  const junk = (t: string) => {
    const c = t.replace(/[^A-Za-z0-9]/g, '')
    return c.length <= 2 || !/[A-Za-z]{2}/.test(c) || /^[A-Z]{3,}$/.test(c) || /^[a-z]{3,4}$/.test(c)
  }
  while (out.length > 1 && junk(out[out.length - 1])) out.pop()
  return out
}

function cleanToken(t: string): string {
  return t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '')
}

function snapCustomer(tokens: string[]): { text: string; snapped: boolean } {
  const text = tokens.join(' ')
  if (!text) return { text, snapped: false }
  const lower = text.toLowerCase()
  for (const known of KNOWN_CUSTOMERS) {
    const k = known.toLowerCase()
    if (lower === k) return { text: known, snapped: false }
    if (levenshtein(lower, k) <= Math.max(1, Math.floor(k.length * 0.25))) return { text: known, snapped: true }
    // A clipped name: its start matches the start of a known name ("Cast" for "Cash/Check Customer").
    const head = lower.length >= 4 ? k.slice(0, lower.length) : ''
    if (head && levenshtein(lower, head) <= 1) return { text: known, snapped: true }
  }
  return { text, snapped: false }
}

function readAction(tok: string): { action: 'arrive' | 'depart' | null; exact: boolean } {
  const t = tok.toLowerCase().replace(/[^a-z]/g, '')
  if (t === 'arrive') return { action: 'arrive', exact: true }
  if (t === 'depart') return { action: 'depart', exact: true }
  if (t.length >= 3 && levenshtein(t, 'arrive') <= 2) return { action: 'arrive', exact: false }
  if (t.length >= 3 && levenshtein(t, 'depart') <= 2) return { action: 'depart', exact: false }
  return { action: null, exact: false }
}

interface Draft {
  row: ExtractedScheduleRow
  services: string[]
  issues: string[] // reasons needing review
  cosmetic: number // harmless OCR repairs (lowers confidence to medium)
  inServices: boolean
  duration: string
  confirmed: string
}

function looksLikeServiceLine(tokens: string[]): boolean {
  if (tokens.length < 2) return false
  if (!/^[A-Z][a-z]{2,}/.test(tokens[0])) return false
  const text = tokens.join(' ')
  return /[-:]/.test(text) || tokens.filter((t) => /^[A-Za-z]{4,}$/.test(t)).length >= 3
}

export function parseTotalFboText(text: string): ParsedTotalFbo {
  const lines = text.split(/\r?\n/).map((l) => l.trim())

  const period = text.match(/For\s+The\s+Period:?\s*(\S+)\s+Through:?\s*(\S+)/i)
  const rangeStart = period ? parseDate(digits(period[1])) : null
  const rangeEnd = period ? parseDate(digits(period[2])) : null
  const range = { start: rangeStart, end: rangeEnd }

  const runLine = lines.find((l) => /^\W*Run\b/i.test(l))
  const runDate = runLine?.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]
  const sheetDate = runDate ? parseDate(runDate) : null
  const company = runLine?.replace(/^\W*Run:?/i, '').replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '').replace(/Page:?.*$/i, '').trim()

  const titled = /scheduled\s+arrivals/i.test(text) || /\bAction\b[\s\S]{0,40}\bAircraft\b/i.test(text)

  const drafts: Draft[] = []
  let current: Draft | null = null

  for (const line of lines) {
    if (!line) continue
    const m = line.match(ROW_RE)
    if (m) {
      current = readRow(m, range)
      drafts.push(current)
      continue
    }
    if (!current) continue

    const dur = line.match(/^\W*Service\s+Duration\s*[-–—~]?\s*(.*)$/i)
    if (dur) {
      const words: string[] = []
      for (const w of dur[1].split(/\s+/)) {
        if (/^[A-Z][a-z]{2,}$/.test(w) && words.length < 2) words.push(w)
        else break
      }
      current.duration = words.length ? `Service Duration - ${words.join(' ')}` : ''
      current.inServices = false
      continue
    }
    if (/^\W*Services?\s+Required\b/i.test(line)) {
      current.inServices = true
      continue
    }
    if (current.inServices) {
      const tokens = trimJunkTail(line.split(/\s+/).filter(Boolean))
      // "Status: Confirmed" ends at one value word; whatever follows is noise from the right-hand columns.
      const st = tokens.findIndex((t) => /^status:?$/i.test(t))
      const kept = st >= 0 && st + 1 < tokens.length ? tokens.slice(0, st + 2) : tokens
      if (looksLikeServiceLine(kept)) current.services.push(kept.join(' '))
    }
  }

  const rows = drafts.map((d) => {
    d.row.services = d.services.join(', ')
    d.row.notes = [d.duration, d.confirmed ? `Confirmed ${d.confirmed}` : ''].filter(Boolean).join('; ')
    d.row.needs_review = d.issues.length > 0
    d.row.confidence = d.issues.length >= 2 ? 'low' : d.issues.length === 1 ? 'medium' : d.cosmetic > 0 ? 'medium' : 'high'
    return d.row
  })
  const actionRows = drafts.filter((d) => !d.issues.includes('action')).length
  const recognised = titled || actionRows >= 2

  return {
    recognised,
    rowCount: rows.length,
    needsReviewCount: rows.filter((r) => r.needs_review).length,
    sheet: {
      sheet_date: sheetDate,
      date_range_start: rangeStart,
      date_range_end: rangeEnd,
      source_software_hint: titled ? `${company ? `${company} - ` : ''}Scheduled Arrivals and Requests` : '',
      rows
    }
  }
}

function readRow(m: RegExpMatchArray, range: { start: string | null; end: string | null }): Draft {
  const [, dateTok, timeTok, meridTok, rest] = m
  const issues: string[] = []
  let cosmetic = 0

  const date = readDate(dateTok, range)
  if (date.repaired) issues.push('date_repaired')
  else if (!date.iso || !date.inRange) issues.push('date')

  let time: string | null = null
  const merid = meridTok?.replace(/[^A-Za-z]/g, '')[0]?.toUpperCase()
  const clock = digits(timeTok).replace(/[.;]/, ':')
  if (merid) time = parseTime(`${clock} ${merid}M`)
  else {
    time = parseTime(clock)
    issues.push('meridiem') // 12 h sheet: a time with no AM/PM is ambiguous
  }
  if (!time) issues.push('time')

  const tokens = rest.split(/\s+/).map(cleanToken).filter(Boolean)
  const act = readAction(tokens[0] ?? '')
  if (!act.action) issues.push('action')
  else if (!act.exact) cosmetic++
  const after = act.action ? tokens.slice(1) : tokens

  const tail = normalizeTail(after[0] ?? '')
  if (!isPlausibleTail(tail)) issues.push('tail')
  const type = (after[1] ?? '').toUpperCase()

  let tail2 = after.slice(2)
  let confirmed = ''
  const last = tail2[tail2.length - 1]
  if (last && DATE_TOKEN_RE.test(last)) {
    confirmed = parseDate(last) ? last : ''
    tail2 = tail2.slice(0, -1)
  }
  const cust = snapCustomer(trimJunkTail(tail2))
  if (cust.snapped) cosmetic++
  if (!cust.text) issues.push('customer')

  const iso = date.iso && /^\d{4}-/.test(date.iso) ? date.iso : ''
  const row: ExtractedScheduleRow = {
    tail_number: tail,
    aircraft_type: type,
    customer: cust.text,
    group_date: '',
    arrival_date: act.action === 'arrive' ? iso : '',
    arrival_time: act.action === 'arrive' ? (time ?? '') : '',
    departure_date: act.action === 'depart' ? iso : '',
    departure_time: act.action === 'depart' ? (time ?? '') : '',
    services: '',
    notes: '',
    raw_row_text: [dateTok, `${clock}${merid ? ` ${merid}M` : ''}`, tokens[0] ?? '', tail, type, cust.text, confirmed]
      .filter(Boolean)
      .join(' | '),
    needs_review: false,
    confidence: 'high',
    page: 1
  }
  // Ambiguous action: keep the time in a neutral place so the review screen shows it, but flag it.
  if (!act.action && time) row.arrival_time = time
  return { row, services: [], issues, cosmetic, inServices: false, duration: '', confirmed }
}
