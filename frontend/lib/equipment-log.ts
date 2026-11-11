/** Filters are replaced at least once a year, sooner when DPI climbs. */
export const FILTER_LIFE_DAYS = 365
/** Differential pressure (psi) at which a filter is flagged for replacement. Ted to confirm the real limit. */
export const DPI_REPLACE_AT = 15

const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - Date.parse(fromIso)) / DAY_MS)
}

export type FilterState = 'unknown' | 'ok' | 'due_soon' | 'overdue'

/** Age of the filters since the last change; due soon within 30 days of the yearly limit. */
export function filterState(lastChangedAt: string | null, now: Date = new Date()): { state: FilterState; days: number | null } {
  if (!lastChangedAt) return { state: 'unknown', days: null }
  const days = daysBetween(lastChangedAt, now)
  if (days >= FILTER_LIFE_DAYS) return { state: 'overdue', days }
  if (days >= FILTER_LIFE_DAYS - 30) return { state: 'due_soon', days }
  return { state: 'ok', days }
}

export interface ReadingPoint {
  read_at: string
  dpi_psi: number | null
  nozzle_psi: number | null
}

/**
 * Psi per day change of DPI between the oldest and newest DPI reading in `points` (any order); null with fewer than
 * two DPI readings at least a day apart. A rising value means the filters are loading up.
 */
export function dpiTrendPerDay(points: ReadingPoint[]): number | null {
  const dpi = points.filter((p) => p.dpi_psi != null).sort((a, b) => Date.parse(a.read_at) - Date.parse(b.read_at))
  if (dpi.length < 2) return null
  const first = dpi[0]
  const last = dpi[dpi.length - 1]
  const days = (Date.parse(last.read_at) - Date.parse(first.read_at)) / DAY_MS
  if (days < 1) return null
  return ((last.dpi_psi as number) - (first.dpi_psi as number)) / days
}

/** Whole days until DPI is projected to reach `DPI_REPLACE_AT` at the current trend; null when not rising or unknown. */
export function daysUntilDpiLimit(points: ReadingPoint[]): number | null {
  const slope = dpiTrendPerDay(points)
  const newest = [...points].filter((p) => p.dpi_psi != null).sort((a, b) => Date.parse(b.read_at) - Date.parse(a.read_at))[0]
  if (slope == null || slope <= 0 || !newest) return null
  const left = DPI_REPLACE_AT - (newest.dpi_psi as number)
  return left <= 0 ? 0 : Math.ceil(left / slope)
}

/** Largest value `equipment_reading.dpi_psi` / `nozzle_psi` (numeric(5,1)) can hold. */
export const MAX_PSI = 9999.9

/**
 * Reads a psi value typed on the truck sheet. '' is "not recorded" (null); anything else must be a number from 0 to
 * MAX_PSI or the result is 'invalid'.
 */
export function parsePsi(text: string): number | null | 'invalid' {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+(\.\d+)?$/.test(t)) return 'invalid'
  const n = Number.parseFloat(t)
  if (!Number.isFinite(n) || n > MAX_PSI) return 'invalid'
  return Math.round(n * 10) / 10
}

/** Message for a bad DPI / nozzle entry on the truck sheet, or null when both are blank or valid. */
export function psiProblem(dpiText: string, nozzleText: string): string | null {
  if (parsePsi(dpiText) === 'invalid') return 'DPI must be a number in psi (for example 6.5), or left empty.'
  if (parsePsi(nozzleText) === 'invalid') return 'Nozzle PSI must be a number in psi (for example 45), or left empty.'
  return null
}

/**
 * The `equipment_reading` row for the DPI / nozzle PSI written on a truck sheet, so the truck's daily log and trend
 * pick it up (no second store). Null when neither was filled in. The reading is dated midday on the sheet date.
 */
export function truckSheetReadingRow(input: {
  equipmentId: number
  truckSheetId: number
  sheetDate: string
  dpiText: string
  nozzleText: string
  readBy?: number | null
}): {
  equipment_id: number
  truck_sheet_id: number
  read_at: string
  dpi_psi: number | null
  nozzle_psi: number | null
  read_by: number | null
} | null {
  const dpi = parsePsi(input.dpiText)
  const nozzle = parsePsi(input.nozzleText)
  if (dpi === 'invalid' || nozzle === 'invalid') throw new Error(psiProblem(input.dpiText, input.nozzleText) ?? 'Invalid psi')
  if (dpi == null && nozzle == null) return null
  return {
    equipment_id: input.equipmentId,
    truck_sheet_id: input.truckSheetId,
    read_at: new Date(`${input.sheetDate}T12:00:00`).toISOString(),
    dpi_psi: dpi,
    nozzle_psi: nozzle,
    read_by: input.readBy ?? null,
  }
}
