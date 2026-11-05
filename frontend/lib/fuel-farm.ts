// Fuel farm calculations ported from the Minuteman Dashboard (fuel_farm.html).
import { inchesToGallons } from '@/lib/gallons-tables'

export const JET_A_TREND_TANKS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// Red at/below a 10" reading (where these tanks actually run empty), white at
// usable-max. Anchored to inches rather than percentage, per real low-end behaviour.
const LEVEL_COLOR_REDPOINT_INCHES = 10

export function levelPillStyle(level: number, usableMax: number): { background: string; color: string } {
  const t = Math.max(0, Math.min(1, (level - LEVEL_COLOR_REDPOINT_INCHES) / (usableMax - LEVEL_COLOR_REDPOINT_INCHES)))
  const from = [192, 57, 43]
  const to = [255, 255, 255]
  const [r, g, b] = from.map((c, i) => Math.round(c + (to[i] - c) * t))
  return { background: `rgb(${r}, ${g}, ${b})`, color: t < 0.55 ? '#ffffff' : '#2c3e50' }
}

export interface TankMetrics {
  level: number
  usableMax: number
  gallons: number
  percentage: number
  fillPercent: number
  isOverMax: boolean
  /** Gallons still available before the usable-max line (negative when over). */
  ullageGallons: number
  hasRecordedLow: boolean
  recordedLow: number | null
  unusableZonePercent: number
  unusableGallons: number
  usableGallons: number
}

/** Per-tank numbers shown on a card: ullage, unusable heel below the lowest-ever level, usable gallons. */
export function computeTankMetrics(
  tankId: string,
  level: number,
  usableMax: number,
  recordedLow: number | null
): TankMetrics {
  const hasRecordedLow = recordedLow != null
  const gallons = Math.round(inchesToGallons(tankId, level))
  const unusableGallons = hasRecordedLow ? Math.round(inchesToGallons(tankId, recordedLow)) : 0
  return {
    level,
    usableMax,
    gallons,
    percentage: Math.round((level / usableMax) * 100),
    fillPercent: Math.min(100, (level / usableMax) * 100),
    isOverMax: level > usableMax,
    ullageGallons: Math.round(inchesToGallons(tankId, usableMax) - inchesToGallons(tankId, level)),
    hasRecordedLow,
    recordedLow,
    unusableZonePercent: hasRecordedLow ? Math.min(100, (recordedLow / usableMax) * 100) : 0,
    unusableGallons,
    usableGallons: Math.max(0, gallons - unusableGallons),
  }
}

export interface FarmTank {
  tankId: string
  level: number
  usableMax: number
  recordedLow: number | null
}

/** Total gallons across the Jet A trend tanks (T2-T7) for a set of levels. */
export function jetATotalGallons(levels: Record<string, number>): number {
  return JET_A_TREND_TANKS.reduce(
    (sum, id) => sum + (levels[id] != null ? inchesToGallons(id, levels[id]) : 0),
    0
  )
}

/** Room left across T2-T7 before any tank hits its usable-max line; an over-full tank contributes 0. */
export function jetATotalUllage(tanks: FarmTank[]): number {
  return tanks
    .filter((t) => JET_A_TREND_TANKS.includes(t.tankId))
    .reduce(
      (sum, t) => sum + Math.max(0, inchesToGallons(t.tankId, t.usableMax) - inchesToGallons(t.tankId, t.level)),
      0
    )
}

/** Pumpable Jet A across T2-T7: gallons less each tank's heel below its lowest-ever level. */
export function jetATotalUsable(tanks: FarmTank[]): number {
  return tanks
    .filter((t) => JET_A_TREND_TANKS.includes(t.tankId))
    .reduce((sum, t) => sum + computeTankMetrics(t.tankId, t.level, t.usableMax, t.recordedLow).usableGallons, 0)
}
