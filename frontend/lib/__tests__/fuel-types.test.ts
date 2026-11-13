import { describe, expect, it } from 'vitest'
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  fromLineFuelType,
  fromSheetFuelType,
  fromTransactionFuelType,
  toLineFuelType,
  toSheetFuelType,
  toTransactionFuelType
} from '../fuel-types'

describe('fuel_transaction spelling (jet_a, jet_a_plus, avgas)', () => {
  it('reads all three and treats avgas as 100LL', () => {
    expect(fromTransactionFuelType('jet_a')).toBe('jet_a')
    expect(fromTransactionFuelType('jet_a_plus')).toBe('jet_a_plus')
    expect(fromTransactionFuelType('avgas')).toBe('avgas_100')
    expect(fromTransactionFuelType(null)).toBeNull()
  })

  it('writes every app type, or null when the table has no spelling', () => {
    expect(toTransactionFuelType('jet_a')).toBe('jet_a')
    expect(toTransactionFuelType('jet_a_plus')).toBe('jet_a_plus')
    expect(toTransactionFuelType('avgas_100')).toBe('avgas')
    expect(toTransactionFuelType('avgas_80')).toBe('avgas')
    expect(toTransactionFuelType('unleaded')).toBeNull()
  })
})

describe('truck sheet and tank spelling (jet_a, avgas)', () => {
  it('reads both', () => {
    expect(fromSheetFuelType('jet_a')).toBe('jet_a')
    expect(fromSheetFuelType('avgas')).toBe('avgas_100')
    expect(fromSheetFuelType(undefined)).toBeNull()
  })

  it('writes every app type, with Jet A+ as jet_a and no spelling for unleaded', () => {
    expect(toSheetFuelType('jet_a')).toBe('jet_a')
    expect(toSheetFuelType('jet_a_plus')).toBe('jet_a')
    expect(toSheetFuelType('avgas_100')).toBe('avgas')
    expect(toSheetFuelType('avgas_80')).toBe('avgas')
    expect(toSheetFuelType('unleaded')).toBeNull()
  })
})

describe('invoice line spelling (jet_a, avgas_100, avgas_80, unleaded)', () => {
  it('reads all four', () => {
    expect(fromLineFuelType('jet_a')).toBe('jet_a')
    expect(fromLineFuelType('avgas_100')).toBe('avgas_100')
    expect(fromLineFuelType('avgas_80')).toBe('avgas_80')
    expect(fromLineFuelType('unleaded')).toBe('unleaded')
    expect(fromLineFuelType(null)).toBeNull()
  })

  it('writes every app type, with Jet A+ as jet_a (the Prist is its own line)', () => {
    expect(toLineFuelType('jet_a')).toBe('jet_a')
    expect(toLineFuelType('jet_a_plus')).toBe('jet_a')
    expect(toLineFuelType('avgas_100')).toBe('avgas_100')
    expect(toLineFuelType('avgas_80')).toBe('avgas_80')
    expect(toLineFuelType('unleaded')).toBe('unleaded')
  })
})

describe('app enum', () => {
  it('has a label for every type', () => {
    for (const t of FUEL_TYPES) expect(FUEL_TYPE_LABELS[t]).toBeTruthy()
  })

  it('round-trips through the fuel_transaction spelling where that table can hold it', () => {
    for (const t of FUEL_TYPES) {
      const stored = toTransactionFuelType(t)
      if (stored) expect(toTransactionFuelType(fromTransactionFuelType(stored) as never)).toBe(stored)
    }
  })
})
