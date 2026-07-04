/**
 * Sanity checks for truck meter readings. Works on any row shape that can
 * expose numeric meter values — the review table (string inputs) and the
 * detail view (DB rows) both map into ReadingNumbers.
 */
export interface ReadingNumbers {
  meter: 'front' | 'rear' | '' | null
  meter_start: number | null
  meter_end: number | null
  gallons_pumped: number | null
}

export interface ReadingIssue {
  level: 'warn' | 'info'
  message: string
}

const MATH_TOLERANCE_GAL = 1.0
const CONTINUITY_TOLERANCE_GAL = 0.1

/**
 * Returns issues per row index. Checks:
 * - meter math: gallons_pumped should equal meter_end - meter_start
 * - register continuity: a row's meter_start should equal the previous
 *   reading's meter_end on the same register
 */
export function validateReadings(
  rows: ReadingNumbers[]
): Map<number, ReadingIssue[]> {
  const issues = new Map<number, ReadingIssue[]>()
  const add = (idx: number, issue: ReadingIssue) => {
    const list = issues.get(idx) ?? []
    list.push(issue)
    issues.set(idx, list)
  }

  const lastEndByMeter = new Map<string, { idx: number; value: number }>()

  rows.forEach((row, idx) => {
    const { meter_start: start, meter_end: end, gallons_pumped: pumped } = row

    if (start != null && end != null) {
      if (end < start) {
        add(idx, {
          level: 'warn',
          message: 'Meter end is lower than meter start'
        })
      } else if (pumped != null) {
        const delta = end - start
        if (Math.abs(delta - pumped) > MATH_TOLERANCE_GAL) {
          add(idx, {
            level: 'warn',
            message: `Meter math: end − start = ${delta.toFixed(1)} gal but gallons pumped says ${pumped}`
          })
        }
      }
    }

    const meterKey = row.meter || 'front'
    const prev = lastEndByMeter.get(meterKey)
    if (
      prev &&
      start != null &&
      Math.abs(start - prev.value) > CONTINUITY_TOLERANCE_GAL
    ) {
      add(idx, {
        level: 'info',
        message: `Register gap: starts at ${start} but row ${prev.idx + 1} ended at ${prev.value} on the ${meterKey} meter`
      })
    }
    if (end != null) {
      lastEndByMeter.set(meterKey, { idx, value: end })
    }
  })

  return issues
}
