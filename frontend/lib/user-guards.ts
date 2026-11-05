import type { ProfileWithRoles } from '@/types/domain/users'

export const ADMIN_ROLE_NAME = 'Administrator'

function isActiveAdmin(user: ProfileWithRoles): boolean {
  return user.status === 'active' && user.roles.some((r) => r.name === ADMIN_ROLE_NAME)
}

/**
 * Why a role change must not go ahead, or null when it is fine. Stops an admin locking themselves
 * out and stops the app being left with no active Administrator (nobody could fix roles after).
 */
export function roleChangeBlocked(
  users: ProfileWithRoles[],
  targetId: string,
  currentUserId: string | null,
  newRoleNames: string[]
): string | null {
  const target = users.find((u) => u.id === targetId)
  if (!target || !isActiveAdmin(target)) return null
  if (newRoleNames.includes(ADMIN_ROLE_NAME)) return null
  if (targetId === currentUserId) {
    return "You can't remove your own Administrator role. Ask another administrator."
  }
  if (users.filter(isActiveAdmin).length <= 1) {
    return 'At least one active Administrator is required.'
  }
  return null
}

/** Why an account must not be deactivated or deleted, or null when it is fine. */
export function accountRemovalBlocked(
  users: ProfileWithRoles[],
  targetId: string,
  currentUserId: string | null,
  action: 'deactivate' | 'delete'
): string | null {
  if (targetId === currentUserId) {
    return `You can't ${action} your own account.`
  }
  const target = users.find((u) => u.id === targetId)
  if (target && isActiveAdmin(target) && users.filter(isActiveAdmin).length <= 1) {
    return 'At least one active Administrator is required.'
  }
  return null
}

/** Sign-ups waiting for an admin: active accounts with no role yet. */
export function isAwaitingAccess(user: ProfileWithRoles): boolean {
  return user.status === 'active' && user.roles.length === 0
}
