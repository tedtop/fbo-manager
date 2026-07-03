import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from '@/types/database'
import type {
  AccessLevel,
  ModuleKey,
  RoleWithPermissions
} from '@/types/domain/users'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RoleRow = Tables<'roles'>
export type RoleInsert = TablesInsert<'roles'>
export type RoleUpdate = TablesUpdate<'roles'>
export type ModulePermissionRow = Tables<'module_permissions'>

export async function findAllRoles(
  db: SupabaseClient<Database>
): Promise<RoleWithPermissions[]> {
  const { data, error } = await db
    .from('roles')
    .select('*, permissions:module_permissions(*)')
    .order('name')
  if (error) throw error
  return (data ?? []) as unknown as RoleWithPermissions[]
}

export async function findRoleById(
  db: SupabaseClient<Database>,
  id: number
): Promise<RoleWithPermissions | null> {
  const { data, error } = await db
    .from('roles')
    .select('*, permissions:module_permissions(*)')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as unknown as RoleWithPermissions | null
}

export async function createRole(
  db: SupabaseClient<Database>,
  role: RoleInsert
): Promise<RoleRow> {
  const { data, error } = await db.from('roles').insert(role).select().single()
  if (error) throw error
  return data
}

export async function updateRole(
  db: SupabaseClient<Database>,
  id: number,
  updates: RoleUpdate
): Promise<RoleRow> {
  const { data, error } = await db
    .from('roles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRole(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('roles').delete().eq('id', id)
  if (error) throw error
}

/** Replace a role's full module permission grid in one call. */
export async function setRolePermissions(
  db: SupabaseClient<Database>,
  roleId: number,
  grid: Partial<Record<ModuleKey, AccessLevel | null>>
): Promise<void> {
  const { error: deleteError } = await db
    .from('module_permissions')
    .delete()
    .eq('role_id', roleId)
  if (deleteError) throw deleteError

  const rows = Object.entries(grid)
    .filter(([, level]) => level)
    .map(([module, access_level]) => ({
      role_id: roleId,
      module: module as ModuleKey,
      access_level: access_level as AccessLevel
    }))

  if (rows.length === 0) return

  const { error: insertError } = await db
    .from('module_permissions')
    .insert(rows)
  if (insertError) throw insertError
}
