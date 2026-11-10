import { describe, expect, it } from 'vitest'
import { dpiTrendPerDay, daysUntilDpiLimit, filterState } from '../equipment-log'

const at = (d: number) => new Date(Date.UTC(2026, 10, d, 12)).toISOString()

describe('filterState', () => {
  const now = new Date(Date.UTC(2027, 0, 1))
  it('is unknown without a change', () => expect(filterState(null, now).state).toBe('unknown'))
  it('is ok when recent', () => expect(filterState('2026-10-01T00:00:00Z', now).state).toBe('ok'))
  it('is due soon inside the last 30 days', () => expect(filterState('2026-01-10T00:00:00Z', now).state).toBe('due_soon'))
  it('is overdue after a year', () => expect(filterState('2025-12-31T00:00:00Z', now)).toEqual({ state: 'overdue', days: 366 }))
})

describe('dpi trend', () => {
  it('needs two readings a day apart', () => {
    expect(dpiTrendPerDay([{ read_at: at(1), dpi_psi: 4, nozzle_psi: 30 }])).toBeNull()
  })
  it('computes psi per day regardless of order', () => {
    const pts = [
      { read_at: at(11), dpi_psi: 8, nozzle_psi: null },
      { read_at: at(1), dpi_psi: 4, nozzle_psi: 30 },
    ]
    expect(dpiTrendPerDay(pts)).toBeCloseTo(0.4)
  })
  it('projects days to the limit, null when falling', () => {
    const rising = [
      { read_at: at(1), dpi_psi: 4, nozzle_psi: null },
      { read_at: at(11), dpi_psi: 8, nozzle_psi: null },
    ]
    expect(daysUntilDpiLimit(rising)).toBe(18)
    expect(daysUntilDpiLimit([...rising].reverse().map((p, i) => ({ ...p, dpi_psi: i ? 8 : 4 })))).toBeNull()
  })
})
