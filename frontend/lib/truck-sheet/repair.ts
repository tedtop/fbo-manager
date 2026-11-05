// Arithmetic checks and single-digit repair for a parsed truck sheet (pure). Handwritten digits are the main error
// source, and the form is redundant by design, so the numbers can check each other:
//   end - start = gallons pumped; a row's meter start = the previous end on the same register (the first row = the
//   header's starting number); gallons remaining = the previous remaining -/+ gallons pumped (the first row starts from
//   the shaded starting-gallons box).
// A violated check is repaired only when exactly one field can be changed by one digit (substitute, insert or delete)
// to satisfy it without breaking any other check; otherwise the value is left as read and the rows are flagged.
import type { ExtractedReading, ExtractedTruckSheet } from './types'

interface Ref {
  label: string
  row: number | null // reading index, null for a header field
  get: () => string
  set: (v: string) => void
}
interface Term {
  ref: Ref
  coef: number
}
interface Constraint {
  name: string
  terms: Term[]
  rows: number[]
}

const ADDS_TO_TRUCK = new Set(['tank_fill', 'transfer_in'])

function num(s: string): number | null {
  if (!s || !/^-?\d+(\.\d+)?$/.test(s.trim())) return null
  return Number.parseFloat(s)
}
function decimals(s: string): number {
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}
function tolerance(terms: Term[]): number {
  const ds = terms.map((t) => decimals(t.ref.get()))
  return ds.every((d) => d === ds[0]) ? 0.05 : 0.55
}

function violation(c: Constraint): number | null {
  let sum = 0
  for (const t of c.terms) {
    const v = num(t.ref.get())
    if (v == null) return null // unreadable operand: this check cannot run
    sum += t.coef * v
  }
  return Math.abs(sum) > tolerance(c.terms) ? sum : 0
}

/** True when b differs from a by at most one inserted, deleted or substituted digit. */
export function withinOneDigit(a: string, b: string): boolean {
  const x = a.replace(/\./g, '')
  const y = b.replace(/\./g, '')
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 1) return false
  if (x.length === y.length) {
    let diff = 0
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++
    return diff <= 1
  }
  const [long, short] = x.length > y.length ? [x, y] : [y, x]
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true
  return false
}

function buildConstraints(sheet: ExtractedTruckSheet): Constraint[] {
  const cs: Constraint[] = []
  const rows = sheet.readings
  const hdr = (label: string, key: 'front_meter_start' | 'rear_meter_start' | 'starting_gallons'): Ref => ({
    label,
    row: null,
    get: () => sheet[key],
    set: (v) => {
      sheet[key] = v
    }
  })
  const field = (i: number, key: 'meter_start' | 'meter_end' | 'gallons_pumped' | 'gallons_remaining'): Ref => ({
    label: key.replace('_', ' '),
    row: i,
    get: () => rows[i][key],
    set: (v) => {
      rows[i][key] = v
    }
  })

  const lastEnd: Record<string, Ref | undefined> = {
    front: sheet.front_meter_start ? hdr('front meter start', 'front_meter_start') : undefined,
    rear: sheet.rear_meter_start ? hdr('rear meter start', 'rear_meter_start') : undefined
  }
  let prevRem: Ref | undefined = sheet.starting_gallons ? hdr('starting gallons', 'starting_gallons') : undefined

  rows.forEach((r, i) => {
    const start = field(i, 'meter_start')
    const end = field(i, 'meter_end')
    const pumped = field(i, 'gallons_pumped')
    const rem = field(i, 'gallons_remaining')
    const n = i + 1
    if (r.meter_start && r.meter_end && r.gallons_pumped) {
      cs.push({
        name: `row ${n}: meter end - start must equal gallons pumped`,
        terms: [{ ref: end, coef: 1 }, { ref: start, coef: -1 }, { ref: pumped, coef: -1 }],
        rows: [i]
      })
    }
    const key = r.meter || 'front'
    if (r.meter_start) {
      const prev = lastEnd[key]
      if (prev)
        cs.push({
          name: `row ${n}: meter start must equal the previous meter end`,
          terms: [{ ref: start, coef: 1 }, { ref: prev, coef: -1 }],
          rows: prev.row == null ? [i] : [prev.row, i]
        })
    }
    if (r.meter_end) lastEnd[key] = end
    if (r.gallons_remaining) {
      if (prevRem && r.gallons_pumped) {
        const sign = ADDS_TO_TRUCK.has(r.reading_type) ? -1 : 1
        cs.push({
          name: `row ${n}: gallons remaining must follow the previous remaining and gallons pumped`,
          terms: [{ ref: rem, coef: 1 }, { ref: prevRem, coef: -1 }, { ref: pumped, coef: sign }],
          rows: prevRem.row == null ? [i] : [prevRem.row, i]
        })
      }
      prevRem = rem
    } else {
      prevRem = undefined
    }
  })
  return cs
}

function fmt(v: number, places: number): string {
  return places > 0 ? v.toFixed(places) : String(Math.round(v))
}

function flag(r: ExtractedReading, note: string) {
  r.needs_review = true
  r.review_notes = r.review_notes ? `${r.review_notes}; ${note}` : note
}

export interface RepairReport {
  corrected: string[]
  flagged: string[]
}

/** Mutates the sheet: applies unambiguous one-digit repairs and flags rows that still break a check. */
export function repairArithmetic(sheet: ExtractedTruckSheet): RepairReport {
  const report: RepairReport = { corrected: [], flagged: [] }
  const rowsFixed = new Map<number, string[]>()

  for (let pass = 0; pass < 30; pass++) {
    const cs = buildConstraints(sheet)
    const broken = cs.filter((c) => (violation(c) ?? 0) !== 0)
    if (broken.length === 0) break
    const totalBefore = broken.length
    let applied = false

    for (const c of broken) {
      const candidates: { term: Term; value: string }[] = []
      for (const t of c.terms) {
        const others = c.terms
          .filter((o) => o !== t)
          .reduce((s, o) => s + o.coef * (num(o.ref.get()) ?? Number.NaN), 0)
        const solved = -others / t.coef
        const read = t.ref.get()
        if (!Number.isFinite(solved) || solved < 0) continue
        const value = fmt(solved, decimals(read))
        if (value === read || !withinOneDigit(read, value)) continue
        // Accept only if it fixes this check and leaves strictly fewer broken checks overall.
        t.ref.set(value)
        const after = buildConstraints(sheet).filter((k) => (violation(k) ?? 0) !== 0).length
        t.ref.set(read)
        if (after < totalBefore) candidates.push({ term: t, value })
      }
      if (candidates.length === 1) {
        const { term, value } = candidates[0]
        const read = term.ref.get()
        term.ref.set(value)
        const note = `${term.ref.label} corrected from ${read} to ${value} (arithmetic check)`
        report.corrected.push(`${term.ref.row == null ? 'header' : `row ${term.ref.row + 1}`}: ${note}`)
        if (term.ref.row != null) {
          const list = rowsFixed.get(term.ref.row) ?? []
          list.push(note)
          rowsFixed.set(term.ref.row, list)
        }
        applied = true
        break // constraints changed: rebuild
      }
    }
    if (!applied) break
  }

  for (const c of buildConstraints(sheet)) {
    const v = violation(c)
    if (v == null || v === 0) continue
    const msg = `${c.name} (off by ${Math.abs(v).toFixed(1).replace(/\.0$/, '')})`
    report.flagged.push(msg)
    for (const i of c.rows) flag(sheet.readings[i], msg.replace(/^row \d+: /, ''))
  }
  for (const [i, notes] of rowsFixed) for (const n of notes) flag(sheet.readings[i], n)
  return report
}
