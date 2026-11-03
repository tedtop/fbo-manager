import { describe, expect, it } from 'vitest'
import { describeError } from '../error-message'

describe('describeError', () => {
  it('uses the message of an Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('includes PostgREST details when present', () => {
    expect(
      describeError({ message: 'insert failed', details: 'Key is duplicated', code: '23505' })
    ).toBe('insert failed (Key is duplicated)')
  })

  it('accepts a plain string', () => {
    expect(describeError('nope')).toBe('nope')
  })

  it('falls back for unknown values or empty messages', () => {
    expect(describeError(undefined, 'fb')).toBe('fb')
    expect(describeError({ message: '  ' }, 'fb')).toBe('fb')
    expect(describeError(null)).toBe('Something went wrong')
  })
})
