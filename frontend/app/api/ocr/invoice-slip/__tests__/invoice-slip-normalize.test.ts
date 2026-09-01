import { describe, expect, it } from 'vitest'
import { normalizeExtractedInvoiceSlip } from '../route'

describe('normalizeExtractedInvoiceSlip', () => {
  it('trims and uppercases identity fields, lowercases the tank unit', () => {
    const result = normalizeExtractedInvoiceSlip({
      invoice_number: ' 21483 ',
      aircraft_no: 'n 116 fe',
      aircraft_type: ' b737 ',
      customer_name: ' Life Flight ',
      tank_reading_unit: 'LBS'
    })

    expect(result.invoice_number).toBe('21483')
    expect(result.aircraft_no).toBe('N116FE')
    expect(result.aircraft_type).toBe('B737')
    expect(result.customer_name).toBe('Life Flight')
    expect(result.tank_reading_unit).toBe('lbs')
  })

  it('defaults every missing field to an empty string, and slip_date to null', () => {
    const result = normalizeExtractedInvoiceSlip({})

    expect(result.invoice_number).toBe('')
    expect(result.slip_date).toBeNull()
    expect(result.aircraft_no).toBe('')
    expect(result.tank_reading_unit).toBe('')
    expect(result.tank_reading_before_left).toBe('')
    expect(result.notes).toBe('')
  })

  it('rejects an unrecognized tank_reading_unit rather than passing it through', () => {
    const result = normalizeExtractedInvoiceSlip({
      tank_reading_unit: 'gallons'
    })
    expect(result.tank_reading_unit).toBe('')
  })

  it('preserves a valid slip_date string', () => {
    const result = normalizeExtractedInvoiceSlip({ slip_date: '2026-07-04' })
    expect(result.slip_date).toBe('2026-07-04')
  })

  it('strips spaces and dashes from the tail number', () => {
    const result = normalizeExtractedInvoiceSlip({ aircraft_no: 'N-116-FE' })
    expect(result.aircraft_no).toBe('N116FE')
  })
})
