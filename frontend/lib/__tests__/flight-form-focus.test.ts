import { describe, expect, it } from 'vitest'
import { shouldFocusTailOnEnable } from '../flight-form-focus'

describe('shouldFocusTailOnEnable', () => {
  it('takes focus when the field turns enabled and focus sits on a non-text control', () => {
    expect(shouldFocusTailOnEnable(true, false, 'BUTTON')).toBe(true)
    expect(shouldFocusTailOnEnable(true, false, 'BODY')).toBe(true)
    expect(shouldFocusTailOnEnable(true, false, undefined)).toBe(true)
  })

  it('does not steal focus from a text field the person is typing in', () => {
    expect(shouldFocusTailOnEnable(true, false, 'INPUT')).toBe(false)
    expect(shouldFocusTailOnEnable(true, false, 'textarea')).toBe(false)
    expect(shouldFocusTailOnEnable(true, false, 'DIV', true)).toBe(false)
  })

  it('does nothing unless the field just went from disabled to enabled', () => {
    expect(shouldFocusTailOnEnable(false, false, 'BUTTON')).toBe(false)
    expect(shouldFocusTailOnEnable(true, true, 'BUTTON')).toBe(false)
    expect(shouldFocusTailOnEnable(false, true, 'BUTTON')).toBe(false)
  })
})
