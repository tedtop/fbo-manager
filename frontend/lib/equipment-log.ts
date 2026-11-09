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
