import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '@/lib/unique-violation'

describe('isUniqueViolation', () => {
  it('recognises a PostgrestError-shaped plain object with code 23505', () => {
    expect(
      isUniqueViolation({ code: '23505', message: 'x', details: '', hint: '' })
    ).toBe(true)
  })
  it('recognises an Error with a duplicate key message', () => {
    expect(
      isUniqueViolation(new Error('duplicate key value violates unique constraint'))
    ).toBe(true)
  })
  it('recognises a ConstraintViolationError-shaped object by sqlCode', () => {
    expect(
      isUniqueViolation(Object.assign(new Error('conflict'), { sqlCode: '23505' }))
    ).toBe(true)
  })
  it('rejects unrelated errors', () => {
    expect(isUniqueViolation(new Error('network down'))).toBe(false)
    expect(isUniqueViolation({ code: '23503', message: 'foreign key' })).toBe(false)
  })
  it('rejects null, undefined and strings', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('duplicate key')).toBe(false)
  })
})
