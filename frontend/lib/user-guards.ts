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

export const LAST_ADMIN_MESSAGE = 'At least one active Administrator is required.'

/** SQLSTATE the B96 database trigger raises when a change would leave no active Administrator. */
export const LAST_ADMIN_SQLSTATE = 'FBA01'

/**
 * Friendly message for the database's last-active-Administrator refusal (B96), or null when the error is
 * something else. Accepts anything thrown: PostgREST errors (`code`/`message`), Errors, route JSON, strings.
 */
export function lastAdminDbError(err: unknown): string | null {
  const obj = typeof err === 'object' && err !== null ? (err as { code?: unknown; message?: unknown }) : null
  const code = obj?.code != null ? String(obj.code) : ''
  const message = typeof err === 'string' ? err : obj?.message != null ? String(obj.message) : ''
  if (code === LAST_ADMIN_SQLSTATE || /active Administrator/i.test(message)) return LAST_ADMIN_MESSAGE
  return null
}

/** Message for a failed users-module action: the friendly last-Administrator text, else the error's own message, else the fallback. */
export function userActionErrorMessage(err: unknown, fallback: string): string {
  const friendly = lastAdminDbError(err)
  if (friendly) return friendly
  const message = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : ''
  return message || fallback
}
