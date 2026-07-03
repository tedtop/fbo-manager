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

/** Replace a user's full set of role assignments in one call. */
export async function setUserRoles(
  db: SupabaseClient<Database>,
  userId: string,
  roleIds: number[],
  assignedBy: string | null
): Promise<void> {
  const { error: deleteError } = await db
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
  if (deleteError) throw deleteError

  if (roleIds.length === 0) return

  const rows = roleIds.map((roleId) => ({
    user_id: userId,
    role_id: roleId,
    assigned_by: assignedBy
  }))
  const { error: insertError } = await db.from('user_roles').insert(rows)
  if (insertError) throw insertError
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
