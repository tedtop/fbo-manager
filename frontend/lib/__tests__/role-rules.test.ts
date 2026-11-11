import { displayRoles, isIncludedWithAdmin, normalizeRoleIds } from '@/lib/role-rules'
import { describe, expect, it } from 'vitest'

const roles = [
  { id: 1, name: 'Administrator' },
  { id: 2, name: 'Front Desk' },
  { id: 3, name: 'Line Department' },
  { id: 4, name: 'Customer' }
]

describe('role rules (B106: Administrator includes all roles)', () => {
  it('Front Desk and Line Department are included with Administrator; Customer is not', () => {
    expect(isIncludedWithAdmin('Front Desk')).toBe(true)
    expect(isIncludedWithAdmin('Line Department')).toBe(true)
    expect(isIncludedWithAdmin('Customer')).toBe(false)
    expect(isIncludedWithAdmin('Administrator')).toBe(false)
  })

  it('drops included staff roles when Administrator is picked, keeps Customer', () => {
    expect(normalizeRoleIds(roles, [1, 2, 3, 4])).toEqual([1, 4])
    expect(normalizeRoleIds(roles, [2, 1])).toEqual([1])
  })

  it('leaves the choice alone without Administrator', () => {
    expect(normalizeRoleIds(roles, [2, 3])).toEqual([2, 3])
    expect(normalizeRoleIds(roles, [])).toEqual([])
  })

  it('shows an Administrator as Administrator alone', () => {
    expect(displayRoles([roles[1], roles[0], roles[3]])).toEqual([roles[0]])
    expect(displayRoles([roles[1], roles[2]])).toEqual([roles[1], roles[2]])
    expect(displayRoles([])).toEqual([])
  })
})
