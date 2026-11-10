// Meter-gap detection for a fuel truck (docs/PLAN.md "Airline fuelings with meter readings, and meter-gap
// flagging"). Per register (front / rear) each reading's start should equal the previous reading's end;
// a mismatch is a gap (gallons that went through the meter without being recorded). Pure: no I/O.

export type Register = 'front' | 'rear'

/** Six digits before the tenth: the register rolls from 999,999.9 to 0.0. A parameter, not a per-truck setting yet. */
export const DEFAULT_METER_MODULUS = 1_000_000
const TOLERANCE = 0.05

/** Reading types that move the truck's own meter; tank fills and transfers in come through another meter. */
const OWN_METER_TYPES = new Set(['fueling', 'transfer_out', 'other'])

export interface SheetLike {
  id: number
  sheet_date: string
  front_meter_start: number | null
  rear_meter_start: number | null
  readings: ReadingLike[]
}

export interface ReadingLike {
  id: number
  line_number: number
  reading_type: string
  meter: Register | null
  meter_start: number | null
  meter_end: number | null
  tail_number?: string | null
}

export interface MeterPoint {
  /** `r<readingId>` or `s<sheetId>` for a header anchor: the identity of the point. */
  key: string
  readingId: number | null
  sheetId: number
  sheetDate: string
  meter: Register
  start: number
  end: number
  anchor: boolean
  tail: string | null
}

export type GapKind = 'gap' | 'overlap' | 'rollover'

export interface MeterGap {
  /** Identity: register plus the point that exposes the gap. */
  id: string
  meter: Register
  kind: GapKind
  toKey: string
  toReadingId: number | null
  toSheetId: number | null
  sheetDate: string
  tail: string | null
  /** The previous point's end. */
  expectedStart: number
  /** This point's start. */
  actualStart: number
  /** Gallons not recorded; negative for an overlap. */
  missingGallons: number
}

export interface GapReport {
  gaps: MeterGap[]
  /** Last recorded end per register, or null when the register has no reading. */
  lastEnd: Record<Register, number | null>
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Points of one register in chain order (sheet date, header anchor first, line number, id). */
export function buildPoints(sheets: SheetLike[], meter: Register): MeterPoint[] {
  const points: (MeterPoint & { line: number })[] = []
  for (const sheet of sheets) {
    const header = meter === 'front' ? sheet.front_meter_start : sheet.rear_meter_start
    if (header != null) {
      points.push({
        key: `s${sheet.id}`, readingId: null, sheetId: sheet.id, sheetDate: sheet.sheet_date, meter,
        start: header, end: header, anchor: true, tail: null, line: -1
      })
    }
    for (const r of sheet.readings) {
      if (r.meter !== meter || r.meter_start == null || r.meter_end == null) continue
      if (!OWN_METER_TYPES.has(r.reading_type)) continue
      points.push({
        key: `r${r.id}`, readingId: r.id, sheetId: sheet.id, sheetDate: sheet.sheet_date, meter,
        start: r.meter_start, end: r.meter_end, anchor: false, tail: r.tail_number ?? null, line: r.line_number
      })
    }
  }
  return points
    .sort((a, b) => a.sheetDate.localeCompare(b.sheetDate) || a.line - b.line || (a.readingId ?? 0) - (b.readingId ?? 0))
    .map(({ line: _line, ...p }) => p)
}

/** Gallons through the register for one reading, handling a roll-over inside the fueling; null when stop is below start without a roll. */
export function pumpedGallons(start: number, end: number, modulus = DEFAULT_METER_MODULUS): { gallons: number; rolledOver: boolean } | null {
  if (end >= start) return { gallons: round1(end - start), rolledOver: false }
  if (start > modulus / 2 && end < modulus / 2) return { gallons: round1(end + modulus - start), rolledOver: true }
  return null
}

export function detectGaps(sheets: SheetLike[], modulus = DEFAULT_METER_MODULUS): GapReport {
  const gaps: MeterGap[] = []
  const lastEnd: Record<Register, number | null> = { front: null, rear: null }
  for (const meter of ['front', 'rear'] as const) {
    // A reading whose stop is below its start without a roll cannot be chained.
    const points = buildPoints(sheets, meter).filter((p) => p.anchor || p.end >= p.start || pumpedGallons(p.start, p.end, modulus))
    const ends = new Map<string, number>()
    for (const p of points) ends.set(round1(p.end).toFixed(1), (ends.get(round1(p.end).toFixed(1)) ?? 0) + 1)
    points.forEach((p, i) => {
      if (i === 0) return
      const expected = points[i - 1].end
      const diff = p.start - expected
      if (Math.abs(diff) <= TOLERANCE) return
      // Out-of-order tolerance: the start equals some other point's end, so the order was wrong, not the numbers.
      const selfEnd = round1(p.end).toFixed(1)
      const matches = (ends.get(round1(p.start).toFixed(1)) ?? 0) - (round1(p.start).toFixed(1) === selfEnd ? 1 : 0)
      if (matches > 0) return
      let kind: GapKind
      let missing: number
      if (diff > 0) { kind = 'gap'; missing = diff }
      else if (-diff <= modulus / 2) { kind = 'overlap'; missing = diff }
      else { kind = 'rollover'; missing = diff + modulus }
      gaps.push({
        id: `${meter}:${p.key}`, meter, kind, toKey: p.key, toReadingId: p.readingId, toSheetId: p.anchor ? p.sheetId : null,
        sheetDate: p.sheetDate, tail: p.tail, expectedStart: expected, actualStart: p.start, missingGallons: round1(missing)
      })
    })
    lastEnd[meter] = points.length ? points[points.length - 1].end : null
  }
  return { gaps, lastEnd }
}

/** Note for a typed start that does not continue the truck's last end; null when it does (or there is nothing to compare). */
export function startMismatch(lastEnd: number | null, typedStart: number | undefined, modulus = DEFAULT_METER_MODULUS) {
  if (lastEnd == null || typedStart == null || !Number.isFinite(typedStart)) return null
  const diff = typedStart - lastEnd
  if (Math.abs(diff) <= TOLERANCE) return null
  const kind: GapKind = diff > 0 ? 'gap' : -diff <= modulus / 2 ? 'overlap' : 'rollover'
  return { kind, lastEnd, missingGallons: round1(kind === 'rollover' ? diff + modulus : diff) }
}

export const GAP_REASONS = [
  { value: 'meter_roll', label: 'Meter roll' },
  { value: 'forgotten_fueling', label: 'Forgotten fueling' },
  { value: 'typo', label: 'Typo' },
  { value: 'other', label: 'Other' }
] as const
export type GapReason = (typeof GAP_REASONS)[number]['value']
