/**
 * Sanity check for an invoice slip's meter block, mirroring
 * truck-sheets/reading-validation.ts's meter-math check: gallons delivered
 * should equal meter stop minus meter start.
 */

const MATH_TOLERANCE_GAL = 1.0

export function validateSlipMeter(input: {
  meter_start: number | null
  meter_stop: number | null
  gallons_delivered: number | null
}): string | null {
  const {
    meter_start: start,
    meter_stop: stop,
    gallons_delivered: delivered
  } = input
  if (start == null || stop == null) return null
  if (stop < start) return 'Meter stop is lower than meter start'
  if (delivered == null) return null
  const delta = stop - start
  if (Math.abs(delta - delivered) > MATH_TOLERANCE_GAL) {
    return `Meter math: stop − start = ${delta.toFixed(1)} gal but gallons delivered says ${delivered}`
  }
  return null
}
