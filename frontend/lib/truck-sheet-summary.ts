import type { TruckSheetWithReadings } from '@/repositories/truck-sheets.repo'

export interface SheetSummary {
  frontStart: number | null
  frontEnd: number | null
  rearStart: number | null
  rearEnd: number | null
  /** Gallons pumped into aircraft (fueling lines only, like the Fuel Truck Logs list). */
  gallonsPumped: number
  startingGallons: number | null
  /** gallons_remaining of the last line that has one. */
  remainingGallons: number | null
}

/** Meter start/end, gallons pumped and remaining gallons of one truck sheet, from its header and readings (in line order). */
export function summarizeSheet(sheet: TruckSheetWithReadings): SheetSummary {
  const lastEnd = (meter: 'front' | 'rear') =>
    [...sheet.readings].reverse().find((r) => r.meter === meter && r.meter_end != null)?.meter_end ?? null
  return {
    frontStart: sheet.front_meter_start,
    frontEnd: lastEnd('front'),
    rearStart: sheet.rear_meter_start,
    rearEnd: lastEnd('rear'),
    gallonsPumped: sheet.readings
      .filter((r) => r.reading_type === 'fueling')
      .reduce((sum, r) => sum + (r.gallons_pumped ?? 0), 0),
    startingGallons: sheet.starting_gallons,
    remainingGallons:
      [...sheet.readings].reverse().find((r) => r.gallons_remaining != null)?.gallons_remaining ?? null,
  }
}
