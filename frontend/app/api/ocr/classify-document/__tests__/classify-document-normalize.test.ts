import { describe, expect, it } from 'vitest'
import { normalizeClassification } from '../route'

describe('normalizeClassification', () => {
  it('accepts a known doc_type as-is', () => {
    expect(
      normalizeClassification({
        doc_type: 'truck_sheet',
        notes: 'grid of rows'
      })
    ).toEqual({
      doc_type: 'truck_sheet',
      notes: 'grid of rows'
    })
    expect(normalizeClassification({ doc_type: 'invoice_slip' }).doc_type).toBe(
      'invoice_slip'
    )
  })

  it('falls back to unrecognized for any unknown/garbage value — never trusts the model blindly', () => {
    expect(
      normalizeClassification({ doc_type: 'something_else' }).doc_type
    ).toBe('unrecognized')
    expect(normalizeClassification({ doc_type: 123 }).doc_type).toBe(
      'unrecognized'
    )
    expect(normalizeClassification({}).doc_type).toBe('unrecognized')
  })

  it('trims notes and defaults to empty string when absent', () => {
    expect(
      normalizeClassification({
        doc_type: 'truck_sheet',
        notes: '  looks clear  '
      }).notes
    ).toBe('looks clear')
    expect(normalizeClassification({ doc_type: 'truck_sheet' }).notes).toBe('')
  })
})
