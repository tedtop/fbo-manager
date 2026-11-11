import { displayRoles } from '@/lib/role-rules'
import { phoneDigits } from '@/lib/phone-mask'
import type { UserNameSort } from '@/lib/app-settings'
import { isAwaitingAccess } from '@/lib/user-guards'
import type { ProfileWithRoles } from '@/types/domain/users'

/** B107: sortable columns of the Users table. */
export type UserSortKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'role'
  | 'joined'
  | 'employee_id'
  | 'badge_id'
  | 'status'
export type SortDir = 'asc' | 'desc'
export interface UserSort {
  key: UserSortKey
  dir: SortDir
}

export const DEFAULT_USER_SORT: UserSort = { key: 'name', dir: 'asc' }

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

const hasName = (u: ProfileWithRoles) => !!(u.first_name.trim() || u.last_name.trim())

/** Date the Joined column shows: start date when set, else the sign-up day (YYYY-MM-DD). */
export const joinedDate = (u: Pick<ProfileWithRoles, 'hire_date' | 'created_at'>) =>
  u.hire_date ?? u.created_at.slice(0, 10)

/** Sort value as text; '' means empty (empty values go last in either direction). */
function sortValue(u: ProfileWithRoles, key: UserSortKey, nameBy: UserNameSort): string {
  switch (key) {
    case 'name':
      if (!hasName(u)) return ''
      return nameBy === 'first'
        ? `${u.first_name.trim()}\u0000${u.last_name.trim()}`
        : `${u.last_name.trim()}\u0000${u.first_name.trim()}`
    case 'email':
      return u.email
    case 'phone':
      return phoneDigits(u.phone_number ?? '') || (u.phone_number ?? '').trim()
    case 'role':
      return displayRoles(u.roles).map((r) => r.name).join(', ') || (isAwaitingAccess(u) ? 'Awaiting access' : '')
    case 'joined':
      return joinedDate(u)
    case 'employee_id':
      return (u.employee_id ?? '').trim()
    case 'badge_id':
      return (u.badge_id ?? '').trim()
    case 'status':
      return u.status
  }
}

/** Comparator for one column. Empty values (and "No name yet" rows) always sort last, whatever the direction. */
export function compareUsers(
  a: ProfileWithRoles,
  b: ProfileWithRoles,
  sort: UserSort,
  nameBy: UserNameSort = 'last'
): number {
  const va = sortValue(a, sort.key, nameBy)
  const vb = sortValue(b, sort.key, nameBy)
  if (!va !== !vb) return va ? -1 : 1
  let c = collator.compare(va, vb)
  if (sort.dir === 'desc') c = -c
  if (c !== 0) return c
  // Stable, predictable ties: name, then email.
  const [n1, n2] = nameBy === 'first' ? (['first_name', 'last_name'] as const) : (['last_name', 'first_name'] as const)
  return (
    collator.compare(a[n1], b[n1]) ||
    collator.compare(a[n2], b[n2]) ||
    collator.compare(a.email, b.email)
  )
}

export function sortUsers(users: ProfileWithRoles[], sort: UserSort, nameBy: UserNameSort = 'last'): ProfileWithRoles[] {
  return [...users].sort((a, b) => compareUsers(a, b, sort, nameBy))
}

/** Click on a header: same column flips the direction, a new column starts ascending. */
export function nextSort(current: UserSort, key: UserSortKey): UserSort {
  return current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: 'asc' }
}
