import { describe, expect, it } from 'vitest'
import {
  fuelerCandidates,
  initialsConflictMessage,
  initialsError,
  normalizeInitials,
  resolveFuelerInitials,
  type FuelerCandidate,
} from '@/lib/fueler-initials'

const u = (id: string, first: string, last: string, initials: string | null): FuelerCandidate => ({
  id,
  first_name: first,
  last_name: last,
  initials,
})
const ted = u('1', 'Ted', 'Top', 'TT')
const troy = u('2', 'Troy', 'Sheehan', 'TS')
const tate = u('3', 'Tate', 'Thomas', 'TT')

describe('resolveFuelerInitials', () => {
  it('resolves a single match, ignoring case and punctuation', () => {
    expect(resolveFuelerInitials('ts', [ted, troy])).toEqual({ status: 'resolved', user: troy })
    expect(resolveFuelerInitials(' T.S. ', [ted, troy])).toEqual({ status: 'resolved', user: troy })
  })
  it('flags two users with the same initials as ambiguous', () => {
    expect(resolveFuelerInitials('TT', [ted, tate, troy])).toEqual({
      status: 'ambiguous',
      candidates: [ted, tate],
    })
  })
  it('is unresolved for no match, blank input, or users without initials', () => {
    expect(resolveFuelerInitials('KG', [ted, troy])).toEqual({ status: 'unresolved' })
    expect(resolveFuelerInitials('', [ted])).toEqual({ status: 'unresolved' })
    expect(resolveFuelerInitials('TT', [u('9', 'No', 'Init', null)])).toEqual({ status: 'unresolved' })
  })
})

describe('initials helpers', () => {
  it('normalizes', () => {
    expect(normalizeInitials('t-t')).toBe('TT')
    expect(normalizeInitials('abcdef')).toBe('ABCD')
  })
  it('validates', () => {
    expect(initialsError('')).toBeNull()
    expect(initialsError('tt')).toBeNull()
    expect(initialsError('T1')).not.toBeNull()
    expect(initialsError('ABCDE')).not.toBeNull()
  })
  it('maps the unique-index violation to a message', () => {
    expect(
      initialsConflictMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint "uq_profiles_initials_active"',
      }),
    ).toMatch(/already/)
    expect(initialsConflictMessage({ code: '23505', message: 'other' })).toBeNull()
    expect(initialsConflictMessage(null)).toBeNull()
  })
})

describe('fuelerCandidates', () => {
  const p = (c: FuelerCandidate, status: string, roles: string[]) => ({
    ...c,
    status,
    roles: roles.map((name) => ({ name })),
  })
  it('keeps active Line Department users and Administrators, sorted by name', () => {
    const list = fuelerCandidates([
      p(troy, 'active', ['Line Department']),
      p(ted, 'active', ['Administrator']),
      p(tate, 'disabled', ['Line Department']),
      p(u('4', 'Fran', 'Desk', 'FD'), 'active', ['Front Desk']),
    ])
    expect(list.map((x) => x.id)).toEqual(['2', '1'])
  })
})
