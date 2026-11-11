import { buildInlinePatch, checkInlineEmail, draftDisplay, inlineInitial, isUnchanged, isValidIsoDate } from '@/lib/user-inline-edit'
import { describe, expect, it } from 'vitest'

const user = {
  first_name: 'Kelby',
  last_name: 'Grussling',
  email: 'kelby@minutemanfbo.local',
  phone_number: '5555551234',
  hire_date: null,
  employee_id: '12',
  badge_id: null
}

describe('inline edit save logic', () => {
  it('requires both names and trims them', () => {
    expect(buildInlinePatch('name', { first: ' ', last: 'X' })).toEqual({ ok: false, error: 'First and last name are required' })
    expect(buildInlinePatch('name', { first: ' Ann ', last: ' Lee' })).toEqual({ ok: true, patch: { first_name: 'Ann', last_name: 'Lee' } })
  })

  it('stores phone masked, empty as empty, rejects partial numbers', () => {
    expect(buildInlinePatch('phone', '555-555-1234')).toEqual({ ok: true, patch: { phone_number: '(555) 555-1234' } })
    expect(buildInlinePatch('phone', '')).toEqual({ ok: true, patch: { phone_number: '' } })
    expect(buildInlinePatch('phone', '(555) 55')).toMatchObject({ ok: false })
  })

  it('validates dates and clears with empty', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-11-11')).toBe(true)
    expect(buildInlinePatch('hire_date', '2026-13-01')).toEqual({ ok: false, error: 'Enter a valid date' })
    expect(buildInlinePatch('hire_date', '')).toEqual({ ok: true, patch: { hire_date: null } })
    expect(buildInlinePatch('hire_date', '2026-11-11')).toEqual({ ok: true, patch: { hire_date: '2026-11-11' } })
  })

  it('saves employee and badge IDs trimmed, empty as null', () => {
    expect(buildInlinePatch('employee_id', ' 77 ')).toEqual({ ok: true, patch: { employee_id: '77' } })
    expect(buildInlinePatch('badge_id', '  ')).toEqual({ ok: true, patch: { badge_id: null } })
  })

  it('detects unchanged drafts so no request is sent', () => {
    expect(isUnchanged(user, 'name', { first: 'Kelby ', last: 'Grussling' })).toBe(true)
    expect(isUnchanged(user, 'name', { first: 'Kel', last: 'Grussling' })).toBe(false)
    expect(isUnchanged(user, 'phone', inlineInitial(user, 'phone'))).toBe(true)
    expect(inlineInitial(user, 'phone')).toBe('(555) 555-1234')
    expect(isUnchanged(user, 'employee_id', '12')).toBe(true)
    expect(isUnchanged(user, 'badge_id', '')).toBe(true)
  })

  it('checks the email draft before the confirm step', () => {
    expect(checkInlineEmail('nope', user.email)).toMatchObject({ ok: false })
    expect(checkInlineEmail('KELBY@minutemanfbo.local', user.email)).toMatchObject({ ok: false })
    expect(checkInlineEmail(' Real@Gmail.com ', user.email)).toEqual({ ok: true, email: 'real@gmail.com' })
  })

  it('shows the pending value while saving', () => {
    expect(draftDisplay('name', { first: 'A', last: 'B' })).toBe('A B')
    expect(draftDisplay('phone', '5555551234')).toBe('(555) 555-1234')
  })
})
