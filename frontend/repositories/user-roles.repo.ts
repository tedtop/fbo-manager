import type { Database, Tables } from '@/types/database'
import type { AccessLevel, ModuleAccessMap } from '@/types/domain/users'
import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRoleRow = Tables<'user_roles'>

export async function assignRole(
  db: SupabaseClient<Database>,
  userId: string,
  roleId: number,
  assignedBy: string | null
): Promise<void> {
  const { error } = await db
    .from('user_roles')
    .insert({ user_id: userId, role_id: roleId, assigned_by: assignedBy })
  if (error && error.code !== '23505') throw error // ignore duplicate assignment
}

export async function unassignRole(
  db: SupabaseClient<Database>,
  userId: string,
  roleId: number
): Promise<void> {
  const { error } = await db
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId)
  if (error) throw error
}

/**
 * Replace a user's full set of role assignments.
 * B96: this is two requests (two transactions), so it never deletes a role the user keeps: roles to add are
 * inserted first, then only the roles actually removed are deleted. A user who keeps Administrator is never
 * momentarily without it, so the database's last-active-Administrator guard cannot trip on a no-op change.
 */
export async function setUserRoles(
  db: SupabaseClient<Database>,
  userId: string,
  roleIds: number[],
  assignedBy: string | null
): Promise<void> {
  const wanted = [...new Set(roleIds)]
  const { data: current, error: currentError } = await db
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
  if (currentError) throw currentError

  const currentIds = (current ?? []).map((r) => r.role_id)
  const toAdd = wanted.filter((id) => !currentIds.includes(id))
  const toRemove = currentIds.filter((id) => !wanted.includes(id))

  if (toAdd.length > 0) {
    const rows = toAdd.map((roleId) => ({
      user_id: userId,
      role_id: roleId,
      assigned_by: assignedBy
    }))
    const { error: insertError } = await db.from('user_roles').insert(rows)
    if (insertError) throw insertError
  }

  if (toRemove.length > 0) {
    const { error: deleteError } = await db
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .in('role_id', toRemove)
    if (deleteError) throw deleteError
  }
}

/** Resolve the effective (most-permissive) per-module access for one user. */
export async function findModuleAccessForUser(
  db: SupabaseClient<Database>,
  userId: string
): Promise<ModuleAccessMap> {
  const { data: assignments, error: assignmentsError } = await db
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
  if (assignmentsError) throw assignmentsError

  const roleIds = (assignments ?? []).map((a) => a.role_id)
  if (roleIds.length === 0) return {}

  const { data: permissions, error: permissionsError } = await db
    .from('module_permissions')
    .select('module, access_level')
    .in('role_id', roleIds)
  if (permissionsError) throw permissionsError

  const map: ModuleAccessMap = {}
  for (const perm of permissions ?? []) {
    const current = map[perm.module]
    if (
      !current ||
      (current === 'view' && perm.access_level === ('manage' as AccessLevel))
    ) {
      map[perm.module] = perm.access_level
    }
  }
  return map
}
