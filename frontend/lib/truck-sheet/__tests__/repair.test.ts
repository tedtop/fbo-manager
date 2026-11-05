import { describe, expect, it } from 'vitest'
import { repairArithmetic, withinOneDigit } from '../repair'
import type { ExtractedReading, ExtractedTruckSheet } from '../types'

function row(p: Partial<ExtractedReading>): ExtractedReading {
  return {
    reading_type: 'fueling', customer: '', tail_number: '', aircraft_type: '', fuel_type_confirmed: true, meter: 'front',
    meter_start: '', meter_end: '', gallons_pumped: '', gallons_remaining: '', prist: '', req_gals_or_lbs: '',
    line_tech_initials: '', invoice_number: '', service_time: '', notes: '', ...p
  }
}
function sheet(readings: ExtractedReading[], p: Partial<ExtractedTruckSheet> = {}): ExtractedTruckSheet {
  return { sheet_date: null, truck_number: '1', fuel_type: 'jet_a', gallons_down: '', starting_gallons: '5000', front_meter_start: '1000', rear_meter_start: '', fueler_initials: '', readings, ...p }
}

describe('withinOneDigit', () => {
  it.each([
    ['12345', '12345', true], ['12345', '12845', true], ['1234', '12345', true], ['12345', '1234', true],
    ['12345', '12855', false], ['123', '12345', false], ['12.3', '123', true]
  ])('%s vs %s -> %s', (a, b, want) => expect(withinOneDigit(a, b)).toBe(want))
})

describe('repairArithmetic', () => {
  it('leaves a consistent sheet alone', () => {
    const s = sheet([row({ meter_start: '1000', meter_end: '1100', gallons_pumped: '100', gallons_remaining: '4900' })])
    const rep = repairArithmetic(s)
    expect(rep.corrected).toEqual([])
    expect(rep.flagged).toEqual([])
    expect(s.readings[0].needs_review).toBeUndefined()
  })

  it('works with tenths digits', () => {
    const s = sheet(
      [row({ meter_start: '1000.4', meter_end: '1034.6', gallons_pumped: '34.2', gallons_remaining: '4965.8' })],
      { front_meter_start: '1000.4' }
    )
    expect(repairArithmetic(s).flagged).toEqual([])
  })

  it('fixes the one field that restores all three checks', () => {
    const s = sheet([
      row({ meter_start: '1000', meter_end: '1100', gallons_pumped: '100', gallons_remaining: '4900' }),
      row({ meter_start: '1100', meter_end: '1300', gallons_pumped: '200', gallons_remaining: '4700' }),
      row({ meter_start: '1300', meter_end: '1350', gallons_pumped: '50', gallons_remaining: '4650' })
    ])
    s.readings[1].meter_end = '1200' // misread: end - start = 100 vs pumped 200, and row 3 start 1300 != 1200
    repairArithmetic(s)
    expect(s.readings[1].meter_end).toBe('1300')
    expect(s.readings[1].review_notes).toMatch(/corrected from 1200 to 1300/)
  })

  it('does not guess when two different single-digit fixes are possible', () => {
    // end - start = 110 vs pumped 115, nothing else constrains the row: end or pumped could be fixed; leave both
    const s = sheet([row({ meter_start: '1000', meter_end: '1110', gallons_pumped: '115' })])
    const rep = repairArithmetic(s)
    expect(rep.corrected).toEqual([])
    expect(s.readings[0]).toMatchObject({ meter_end: '1110', gallons_pumped: '115', needs_review: true })
  })

  it('handles fuel added to the truck (tank fill) in the remaining chain', () => {
    const s = sheet([
      row({ meter_start: '1000', meter_end: '3000', gallons_pumped: '2000', gallons_remaining: '3000' }),
      row({ reading_type: 'tank_fill', meter: '', gallons_pumped: '2000', gallons_remaining: '5000' })
    ])
    expect(repairArithmetic(s).flagged).toEqual([])
  })

  it('skips checks whose operands are unreadable instead of failing', () => {
    const s = sheet([row({ meter_start: '10x0', meter_end: '1100', gallons_pumped: '100' })])
    expect(() => repairArithmetic(s)).not.toThrow()
  })
})
