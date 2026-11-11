import { ADMIN_ROLE_NAME } from '@/lib/user-guards'

/**
 * Staff roles an Administrator automatically has (B106). Administrator already holds every module, so these
 * are derived, never stored: the form shows them as included and drops their rows on save. Customer is not
 * on the list because it is an aircraft-owner role with no module access, not a staff permission.
 */
export const ROLES_INCLUDED_WITH_ADMIN: readonly string[] = ['Front Desk', 'Line Department']

type RoleLike = { id: number; name: string }

/** True when `roleName` is covered by an Administrator role (so it needs no row of its own). */
export function isIncludedWithAdmin(roleName: string): boolean {
  return ROLES_INCLUDED_WITH_ADMIN.includes(roleName)
}

/** Role ids to store: when Administrator is picked, the roles it includes are dropped. */
export function normalizeRoleIds(roles: RoleLike[], selectedIds: number[]): number[] {
  const admin = roles.find((r) => r.name === ADMIN_ROLE_NAME)
  if (!admin || !selectedIds.includes(admin.id)) return selectedIds
  const included = new Set(roles.filter((r) => isIncludedWithAdmin(r.name)).map((r) => r.id))
  return selectedIds.filter((id) => !included.has(id))
}

/** Roles to show in the list: an Administrator is shown as Administrator alone. */
export function displayRoles<T extends RoleLike>(roles: T[]): T[] {
  const admin = roles.find((r) => r.name === ADMIN_ROLE_NAME)
  return admin ? [admin] : roles
}
