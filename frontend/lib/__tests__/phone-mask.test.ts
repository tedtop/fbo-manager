import { displayPhone, formatPhone, maskPhoneInput, normalizePhone, phoneDigits, phoneError } from '@/lib/phone-mask'
import { describe, expect, it } from 'vitest'

describe('phone mask', () => {
  it('formats as digits arrive', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('5')).toBe('(5')
    expect(formatPhone('555')).toBe('(555')
    expect(formatPhone('5555')).toBe('(555) 5')
    expect(formatPhone('555555')).toBe('(555) 555')
    expect(formatPhone('5555551')).toBe('(555) 555-1')
    expect(formatPhone('5555551234')).toBe('(555) 555-1234')
  })

  it('blocks letters, symbols and extra digits', () => {
    expect(maskPhoneInput('(555) 555-1234x', '(555) 555-1234')).toBe('(555) 555-1234')
    expect(maskPhoneInput('ab5c5', '')).toBe('(55')
    expect(maskPhoneInput('(555) 555-12345', '(555) 555-1234')).toBe('(555) 555-1234')
  })

  it('normalizes any pasted format, dropping a leading country code 1', () => {
    for (const raw of ['5555551234', '555-555-1234', '555.555.1234', '+1 555 555 1234', '1 (555) 555-1234', '(555)555-1234'])
      expect(normalizePhone(raw)).toBe('(555) 555-1234')
    expect(phoneDigits('+1 555 555 1234 ext 9')).toBe('5555551234')
  })

  it('lets the field be cleared and backspace over formatting characters', () => {
    expect(maskPhoneInput('', '(5')).toBe('')
    expect(maskPhoneInput('(555)', '(555) ')).toBe('(55') // deleted the space: removes the digit before it
    expect(maskPhoneInput('(555) 555', '(555) 555-')).toBe('(555) 55')
    expect(maskPhoneInput('(55', '(555')).toBe('(55')
  })

  it('validates: empty or a full 10-digit number', () => {
    expect(phoneError('')).toBeNull()
    expect(phoneError('(555) 555-1234')).toBeNull()
    expect(phoneError('(555) 555')).toMatch(/10-digit/)
  })

  it('displays full numbers masked and leaves legacy text alone', () => {
    expect(displayPhone('5555551234')).toBe('(555) 555-1234')
    expect(displayPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(displayPhone(null)).toBe('')
  })
})
