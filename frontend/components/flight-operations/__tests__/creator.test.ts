import { describe, expect, it } from 'vitest'
import { LEGACY_CREATOR, creatorFromUser } from '../creator'

describe('creatorFromUser (B17)', () => {
  it('derives initials, full name and department from the joined user', () => {
    expect(creatorFromUser({ first_name: 'tess', last_name: 'Tower', username: 'tt', role: 'frontdesk' })).toEqual({
      initials: 'TT',
      name: 'tess Tower',
      department: 'Front Desk'
    })
    expect(creatorFromUser({ first_name: 'Lee', last_name: 'Line', role: 'line' }).department).toBe('Line Department')
    expect(creatorFromUser({ first_name: 'Ada', last_name: 'Min', role: 'admin' }).department).toBe('Administration')
  })

  it('falls back to the username when the user has no name', () => {
    expect(creatorFromUser({ first_name: '', last_name: '', username: 'jdoe', role: 'line' })).toMatchObject({
      initials: 'JD',
      name: 'jdoe'
    })
  })

  it('handles a single name part', () => {
    expect(creatorFromUser({ first_name: 'Cher', last_name: '', username: 'cher' })).toMatchObject({
      initials: 'C',
      name: 'Cher'
    })
  })

  it('returns the neutral legacy fallback (never a fake admin) when there is no creator data', () => {
    expect(creatorFromUser(null)).toBe(LEGACY_CREATOR)
    expect(creatorFromUser(undefined)).toBe(LEGACY_CREATOR)
    expect(creatorFromUser({ first_name: '', last_name: '', username: '' })).toBe(LEGACY_CREATOR)
    expect(JSON.stringify(LEGACY_CREATOR)).not.toMatch(/ADM|Admin|USR/)
  })

  it('shows an unknown role as-is rather than inventing a department', () => {
    expect(creatorFromUser({ first_name: 'A', last_name: 'B', role: 'fueler' }).department).toBe('fueler')
  })
})
