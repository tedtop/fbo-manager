/**
 * Fuel ticket reconciliation math. Same philosophy as
 * components/truck-sheets/reading-validation.ts: pure functions over plain
 * numbers so the entry form (string inputs) and detail view (DB rows) both
 * map into the same checks.
 *
 * A ticket balances three ways:
 *   1. Truck meter:      meter stop − meter start = gallons delivered
 *   2. Aircraft gauges:  Σ(left, right, center deltas) = total delta (lbs)
 *   3. Weight ↔ volume:  total gauge delta (lbs) ÷ density ≈ gallons delivered
 */

export type ReadingPosition = 'left' | 'right' | 'center' | 'total'

export interface PositionReading {
  position: ReadingPosition
  reading_start: number | null
  reading_end: number | null
}

export interface TicketNumbers {
  meter_start: number | null // truck meter (LESS READING START)
  meter_stop: number | null // truck meter (METER READING AT STOP)
  quantity_gallons: number | null // QUANTITY (headline number)
  price_per_gallon: number | null // PRICE, tax-inclusive
  density: number | null // lbs/gal, Jet A tickets
  readings: PositionReading[] // DESCRIPTION block gauge lines
}

export interface TicketIssue {
  level: 'error' | 'warn'
  field: 'meter' | 'quantity' | 'readings' | 'density' | 'price'
  message: string
}

/** Truck meter is mechanical with a tenths register; allow a gallon of slop. */
export const METER_TOLERANCE_GAL = 1.0
/** Aircraft gauges read in 10-lb increments; allow one tick per gauge. */
export const GAUGE_SUM_TOLERANCE_LBS = 30
/** Gauge lbs ÷ density vs metered gallons: gauges are the fuzzier instrument. */
export const DENSITY_TOLERANCE_PCT = 0.03

export function meterDelta(
  t: Pick<TicketNumbers, 'meter_start' | 'meter_stop'>
): number | null {
  if (t.meter_start == null || t.meter_stop == null) return null
  return round1(t.meter_stop - t.meter_start)
}

export function readingDelta(r: PositionReading): number | null {
  if (r.reading_start == null || r.reading_end == null) return null
  return round1(r.reading_end - r.reading_start)
}

/** Σ deltas of left/right/center gauge lines (null if none present). */
export function wingSumDelta(readings: PositionReading[]): number | null {
  const wings = readings
    .filter((r) => r.position !== 'total')
    .map(readingDelta)
    .filter((d): d is number => d != null)
  if (wings.length === 0) return null
  return round1(wings.reduce((sum, d) => sum + d, 0))
}

export function totalGaugeDelta(readings: PositionReading[]): number | null {
  const total = readings.find((r) => r.position === 'total')
  return total ? readingDelta(total) : null
}

/** Pounds uplifted per the gauges: totalizer line if present, else wing sum. */
export function poundsUplifted(readings: PositionReading[]): number | null {
  return totalGaugeDelta(readings) ?? wingSumDelta(readings)
}

export function lbsToGallons(lbs: number, density: number): number {
  return density > 0 ? lbs / density : 0
}

export function lineAmount(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Cross-checks every figure on the ticket. Errors block completion;
 * warnings ask the tech to double-check but don't block (paper tickets
 * carry the same ambiguity — the digital form just makes it visible).
 */
export function validateTicket(t: TicketNumbers): TicketIssue[] {
  const issues: TicketIssue[] = []

  // 1. Truck meter math
  const delta = meterDelta(t)
  if (
    t.meter_start != null &&
    t.meter_stop != null &&
    t.meter_stop < t.meter_start
  ) {
    issues.push({
      level: 'error',
      field: 'meter',
      message: 'Meter reading at stop is lower than reading at start'
    })
  } else if (delta != null && t.quantity_gallons != null) {
    if (Math.abs(delta - t.quantity_gallons) > METER_TOLERANCE_GAL) {
      issues.push({
        level: 'warn',
        field: 'quantity',
        message: `Meter shows ${delta.toFixed(1)} gal (stop − start) but quantity says ${t.quantity_gallons.toFixed(1)}`
      })
    }
  }

  // 2. Per-position gauge lines
  for (const r of t.readings) {
    const d = readingDelta(r)
    if (d != null && d < 0) {
      issues.push({
        level: 'warn',
        field: 'readings',
        message: `${POSITION_LABELS[r.position]} gauge ends below where it started`
      })
    }
  }

  const wings = wingSumDelta(t.readings)
  const total = totalGaugeDelta(t.readings)
  if (
    wings != null &&
    total != null &&
    Math.abs(wings - total) > GAUGE_SUM_TOLERANCE_LBS
  ) {
    issues.push({
      level: 'warn',
      field: 'readings',
      message: `Position deltas sum to ${wings.toFixed(0)} but totalizer shows ${total.toFixed(0)}`
    })
  }

  // 3. Weight ↔ volume reconciliation (Jet A weight-based billing)
  const lbs = poundsUplifted(t.readings)
  if (
    lbs != null &&
    t.density != null &&
    t.density > 0 &&
    t.quantity_gallons != null &&
    t.quantity_gallons > 0
  ) {
    const impliedGallons = lbsToGallons(lbs, t.density)
    const pctOff =
      Math.abs(impliedGallons - t.quantity_gallons) / t.quantity_gallons
    if (pctOff > DENSITY_TOLERANCE_PCT) {
      issues.push({
        level: 'warn',
        field: 'density',
        message: `${lbs.toFixed(0)} lbs at ${t.density.toFixed(2)} lbs/gal implies ${impliedGallons.toFixed(0)} gal, ticket says ${t.quantity_gallons.toFixed(0)}`
      })
    }
  }

  // 4. Sanity on the money column
  if (t.price_per_gallon != null && t.price_per_gallon < 0) {
    issues.push({
      level: 'error',
      field: 'price',
      message: 'Price per gallon cannot be negative'
    })
  }
  if (t.quantity_gallons != null && t.quantity_gallons < 0) {
    issues.push({
      level: 'error',
      field: 'quantity',
      message: 'Quantity cannot be negative'
    })
  }

  return issues
}

export const POSITION_LABELS: Record<ReadingPosition, string> = {
  left: 'L',
  right: 'R',
  center: 'C',
  total: 'T'
}

/** Formats a gauge line the way it's written on the paper ticket: 3930-L-7950 */
export function formatReadingLine(r: PositionReading): string {
  const start = r.reading_start != null ? String(r.reading_start) : '—'
  const end = r.reading_end != null ? String(r.reading_end) : '—'
  return `${start}-${POSITION_LABELS[r.position]}-${end}`
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})
const number1 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
})

export function formatCurrency(n: number): string {
  return currency.format(n)
}

export function formatGallons(n: number): string {
  return number1.format(n)
}

/** Parses a positive decimal from a text input; '' and garbage → null. */
export function parseNum(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}
