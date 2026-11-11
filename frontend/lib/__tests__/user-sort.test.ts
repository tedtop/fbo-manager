import { DEFAULT_USER_SORT, nextSort, sortUsers } from '@/lib/user-sort'
import type { ProfileWithRoles } from '@/types/domain/users'
import { describe, expect, it } from 'vitest'

let n = 0
const user = (o: Partial<ProfileWithRoles>): ProfileWithRoles =>
  ({
    id: `u${++n}`,
    email: `u${n}@x.com`,
    first_name: '',
    last_name: '',
    phone_number: '',
    employee_id: null,
    badge_id: null,
    hire_date: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    roles: [],
    ...o
  }) as ProfileWithRoles

const names = (us: ProfileWithRoles[]) => us.map((u) => `${u.first_name} ${u.last_name}`.trim() || '—')

describe('user sort', () => {
  const ann = user({ first_name: 'Ann', last_name: 'Zed' })
  const bob = user({ first_name: 'Bob', last_name: 'Adams' })
  const al = user({ first_name: 'Al', last_name: 'Adams' })
  const none = user({})

  it('sorts by last name then first name, "No name yet" last', () => {
    expect(names(sortUsers([none, ann, bob, al], DEFAULT_USER_SORT))).toEqual(['Al Adams', 'Bob Adams', 'Ann Zed', '—'])
  })

  it('keeps "No name yet" last when descending', () => {
    expect(names(sortUsers([none, ann, bob, al], { key: 'name', dir: 'desc' }))).toEqual(['Ann Zed', 'Bob Adams', 'Al Adams', '—'])
  })

  it('sorts employee IDs numerically with empties last in both directions', () => {
    const a = user({ employee_id: '10' })
    const b = user({ employee_id: '9' })
    const c = user({ employee_id: null })
    expect(sortUsers([a, c, b], { key: 'employee_id', dir: 'asc' }).map((u) => u.employee_id)).toEqual(['9', '10', null])
    expect(sortUsers([a, c, b], { key: 'employee_id', dir: 'desc' }).map((u) => u.employee_id)).toEqual(['10', '9', null])
  })

  it('sorts Joined by start date, falling back to sign-up date', () => {
    const a = user({ hire_date: '2020-05-01', created_at: '2026-01-01T00:00:00Z' })
    const b = user({ hire_date: null, created_at: '2019-01-01T00:00:00Z' })
    expect(sortUsers([a, b], { key: 'joined', dir: 'asc' })).toEqual([b, a])
  })

  it('sorts phone by digits, email and status', () => {
    const a = user({ phone_number: '(555) 555-2000' })
    const b = user({ phone_number: '(555) 555-1000' })
    expect(sortUsers([a, b], { key: 'phone', dir: 'asc' })).toEqual([b, a])
    const d = user({ status: 'disabled' })
    const e = user({ status: 'active' })
    expect(sortUsers([d, e], { key: 'status', dir: 'asc' })).toEqual([e, d])
    const x = user({ email: 'b@x.com' })
    const y = user({ email: 'a@x.com' })
    expect(sortUsers([x, y], { key: 'email', dir: 'asc' })).toEqual([y, x])
  })

  it('sorts by role name, awaiting access by its label', () => {
    const adm = user({ roles: [{ id: 1, name: 'Administrator' } as never] })
    const line = user({ roles: [{ id: 2, name: 'Line Department' } as never] })
    expect(sortUsers([line, adm], { key: 'role', dir: 'asc' })).toEqual([adm, line])
  })

  it('header click flips direction on the same column and starts ascending on a new one', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort({ key: 'name', dir: 'desc' }, 'email')).toEqual({ key: 'email', dir: 'asc' })
  })
})
