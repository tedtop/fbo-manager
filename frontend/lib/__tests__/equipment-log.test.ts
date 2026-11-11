import { describe, expect, it } from 'vitest'
import { dpiTrendPerDay, daysUntilDpiLimit, filterState, parsePsi, psiProblem, truckSheetReadingRow } from '../equipment-log'

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

describe('truck sheet DPI / nozzle PSI', () => {
  it('parses psi text', () => {
    expect(parsePsi('')).toBeNull()
    expect(parsePsi('  ')).toBeNull()
    expect(parsePsi('6.5')).toBe(6.5)
    expect(parsePsi(' 45 ')).toBe(45)
    expect(parsePsi('6.55')).toBe(6.6)
    expect(parsePsi('-1')).toBe('invalid')
    expect(parsePsi('abc')).toBe('invalid')
    expect(parsePsi('1e3')).toBe('invalid')
    expect(parsePsi('10000')).toBe('invalid')
  })

  it('names the bad field', () => {
    expect(psiProblem('', '')).toBeNull()
    expect(psiProblem('6', '45')).toBeNull()
    expect(psiProblem('x', '')).toMatch(/DPI/)
    expect(psiProblem('', 'x')).toMatch(/Nozzle/)
  })

  const base = { equipmentId: 7, truckSheetId: 99, sheetDate: '2026-11-10' }

  it('builds no row when both are empty', () => {
    expect(truckSheetReadingRow({ ...base, dpiText: '', nozzleText: '' })).toBeNull()
  })

  it('builds a row linked to the sheet, dated on the sheet day', () => {
    const row = truckSheetReadingRow({ ...base, dpiText: '6.5', nozzleText: '' })
    expect(row).toMatchObject({ equipment_id: 7, truck_sheet_id: 99, dpi_psi: 6.5, nozzle_psi: null, read_by: null })
    expect(new Date(row!.read_at).getTime()).toBe(new Date('2026-11-10T12:00:00').getTime())
  })

  it('accepts nozzle alone', () => {
    expect(truckSheetReadingRow({ ...base, dpiText: '', nozzleText: '44' })).toMatchObject({ dpi_psi: null, nozzle_psi: 44 })
  })

  it('refuses invalid text', () => {
    expect(() => truckSheetReadingRow({ ...base, dpiText: 'x', nozzleText: '' })).toThrow(/DPI/)
  })

  it('feeds the trend like a manual reading', () => {
    const a = truckSheetReadingRow({ ...base, sheetDate: '2026-11-01', dpiText: '4', nozzleText: '' })!
    const b = truckSheetReadingRow({ ...base, sheetDate: '2026-11-11', dpiText: '8', nozzleText: '' })!
    expect(dpiTrendPerDay([a, b])).toBeCloseTo(0.4)
  })
})
