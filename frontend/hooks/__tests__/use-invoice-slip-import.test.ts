import {
  type ExtractedInvoiceSlip,
  toNumber,
  toReviewSlip,
  toTransactionFuelType
} from '@/hooks/use-invoice-slip-import'
import { describe, expect, it } from 'vitest'

const baseExtraction: ExtractedInvoiceSlip = {
  invoice_number: '21483',
  slip_date: '2026-07-04',
  aircraft_no: 'N116FE',
  aircraft_type: 'B737',
  customer_name: 'Life Flight',
  address: '',
  meter_start: '1000',
  meter_stop: '1300',
  gallons_delivered: '300',
  tank_reading_unit: '',
  tank_reading_before_left: '',
  tank_reading_before_right: '',
  tank_reading_before_center: '',
  tank_reading_before_total: '',
  tank_reading_after_left: '',
  tank_reading_after_right: '',
  tank_reading_after_center: '',
  tank_reading_after_total: '',
  notes: ''
}

describe('toNumber', () => {
  it('parses plain numeric strings', () => {
    expect(toNumber('300')).toBe(300)
  })

  it('strips thousands separators and spaces', () => {
    expect(toNumber('1,249')).toBe(1249)
    expect(toNumber('1 249')).toBe(1249)
  })

  it('returns null for empty or non-numeric input', () => {
    expect(toNumber('')).toBeNull()
    expect(toNumber('T/O')).toBeNull()
  })
})

describe('toTransactionFuelType', () => {
  it('maps jet_a straight through', () => {
    expect(toTransactionFuelType('jet_a')).toBe('jet_a')
  })

  it('collapses both avgas grades to the single fuel_transaction avgas value', () => {
    expect(toTransactionFuelType('avgas_100')).toBe('avgas')
    expect(toTransactionFuelType('avgas_80')).toBe('avgas')
  })

  it('has no fuel_transaction equivalent for unleaded — returns null rather than guessing', () => {
    expect(toTransactionFuelType('unleaded')).toBeNull()
  })
})

describe('toReviewSlip', () => {
  it('seeds editable review defaults not present on the raw extraction', () => {
    const file = new File(['x'], 'slip.jpg', { type: 'image/jpeg' })
    const review = toReviewSlip(file, baseExtraction)

    expect(review.include).toBe(true)
    expect(review.file).toBe(file)
    expect(review.fuel_type).toBe('jet_a')
    expect(review.price_per_gallon).toBe('') // not on the physical slip — must be filled in manually
    expect(review.customer_id).toBeNull()
    expect(review.invoice_number).toBe('21483')
  })

  it('assigns each review slip a distinct local id', () => {
    const file = new File(['x'], 'slip.jpg', { type: 'image/jpeg' })
    const a = toReviewSlip(file, baseExtraction)
    const b = toReviewSlip(file, baseExtraction)
    expect(a.id).not.toBe(b.id)
  })
})
