import {
  accountRemovalBlocked,
  isAwaitingAccess,
  lastAdminDbError,
  roleChangeBlocked,
  userActionErrorMessage
} from '@/lib/user-guards'
import type { ProfileWithRoles, RoleRow } from '@/types/domain/users'
import { describe, expect, it } from 'vitest'

const role = (id: number, name: string): RoleRow => ({
  id,
  name,
  description: '',
  is_system: true,
  created_at: '',
  updated_at: ''
})
const ADMIN = role(1, 'Administrator')
const FRONT = role(2, 'Front Desk')

function user(
  id: string,
  roles: RoleRow[],
  status: 'active' | 'disabled' = 'active'
): ProfileWithRoles {
  return {
    id,
    email: `${id}@example.com`,
    first_name: id,
    last_name: '',
    phone_number: '',
    employee_id: null,
    badge_id: null,
    initials: null,
    hire_date: null,
    status,
    created_at: '',
    updated_at: '',
    created_by: null,
    updated_by: null,
    roles
  }
}

describe('roleChangeBlocked', () => {
  it('allows changes for people who are not admins', () => {
    const users = [user('a', [ADMIN]), user('b', [FRONT])]
    expect(roleChangeBlocked(users, 'b', 'a', ['Administrator'])).toBeNull()
    expect(roleChangeBlocked(users, 'b', 'a', [])).toBeNull()
  })

  it('blocks an admin removing their own admin role', () => {
    const users = [user('a', [ADMIN]), user('c', [ADMIN])]
    expect(roleChangeBlocked(users, 'a', 'a', ['Front Desk'])).toMatch(/your own/)
  })

  it('blocks demoting the last active admin', () => {
    const users = [user('a', [ADMIN]), user('b', [FRONT])]
    expect(roleChangeBlocked(users, 'a', 'b', ['Front Desk'])).toMatch(/At least one/)
  })

  it('does not count a disabled admin as a safety net', () => {
    const users = [user('a', [ADMIN]), user('c', [ADMIN], 'disabled')]
    expect(roleChangeBlocked(users, 'a', 'x', ['Front Desk'])).toMatch(/At least one/)
  })

  it('allows demoting an admin when another active admin remains', () => {
    const users = [user('a', [ADMIN]), user('c', [ADMIN])]
    expect(roleChangeBlocked(users, 'a', 'c', ['Front Desk'])).toBeNull()
  })

  it('keeps an admin an admin when the new set still includes it', () => {
    const users = [user('a', [ADMIN])]
    expect(roleChangeBlocked(users, 'a', 'a', ['Administrator', 'Front Desk'])).toBeNull()
  })
})

describe('accountRemovalBlocked', () => {
  it('never lets someone deactivate or delete themselves', () => {
    const users = [user('a', [FRONT])]
    expect(accountRemovalBlocked(users, 'a', 'a', 'deactivate')).toMatch(/your own/)
    expect(accountRemovalBlocked(users, 'a', 'a', 'delete')).toMatch(/your own/)
  })

  it('protects the last active admin', () => {
    const users = [user('a', [ADMIN]), user('b', [FRONT])]
    expect(accountRemovalBlocked(users, 'a', 'b', 'delete')).toMatch(/At least one/)
  })

  it('allows removing a regular user or a spare admin', () => {
    const users = [user('a', [ADMIN]), user('c', [ADMIN]), user('b', [FRONT])]
    expect(accountRemovalBlocked(users, 'b', 'a', 'delete')).toBeNull()
    expect(accountRemovalBlocked(users, 'c', 'a', 'deactivate')).toBeNull()
  })
})

describe('isAwaitingAccess', () => {
  it('is true only for active accounts with no role', () => {
    expect(isAwaitingAccess(user('a', []))).toBe(true)
    expect(isAwaitingAccess(user('a', [FRONT]))).toBe(false)
    expect(isAwaitingAccess(user('a', [], 'disabled'))).toBe(false)
  })
})

describe('lastAdminDbError / userActionErrorMessage (B96)', () => {
  const FRIENDLY = 'At least one active Administrator is required.'

  it('maps the database SQLSTATE to the friendly message', () => {
    expect(lastAdminDbError({ code: 'FBA01', message: 'whatever' })).toBe(FRIENDLY)
  })

  it('maps the trigger message and the route JSON text', () => {
    expect(
      lastAdminDbError(
        new Error(
          'At least one active Administrator is required: the last active Administrator cannot be demoted, deactivated or deleted.'
        )
      )
    ).toBe(FRIENDLY)
    expect(lastAdminDbError('At least one active Administrator is required.')).toBe(FRIENDLY)
  })

  it('returns null for other errors', () => {
    expect(lastAdminDbError({ code: '23505', message: 'duplicate key' })).toBeNull()
    expect(lastAdminDbError(new Error('Failed to fetch'))).toBeNull()
    expect(lastAdminDbError(null)).toBeNull()
    expect(lastAdminDbError(undefined)).toBeNull()
  })

  it('userActionErrorMessage prefers friendly, then the error message, then the fallback', () => {
    expect(userActionErrorMessage({ code: 'FBA01', message: 'x' }, 'fallback')).toBe(FRIENDLY)
    expect(userActionErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(userActionErrorMessage({ message: 'plain object' }, 'fallback')).toBe('plain object')
    expect(userActionErrorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
