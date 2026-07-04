import type { Database, Tables, TablesUpdate } from '@/types/database'
import type { ProfileWithRoles, RoleRow } from '@/types/domain/users'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProfileRow = Tables<'profiles'>
export type ProfileUpdate = TablesUpdate<'profiles'>

type ProfileWithRoleJoinRow = ProfileRow & {
  roles: Array<{ role: RoleRow | null }>
}

const PROFILE_WITH_ROLES_SELECT = `
  *,
  roles:user_roles(role:roles(*))
`

function mapProfileWithRoles(row: ProfileWithRoleJoinRow): ProfileWithRoles {
  const roles = (row.roles ?? [])
    .map((ur) => ur.role)
    .filter((role): role is RoleRow => role !== null)
  return { ...row, roles }
}

export async function findAllProfiles(
  db: SupabaseClient<Database>
): Promise<ProfileWithRoles[]> {
  const { data, error } = await db
    .from('profiles')
    .select(PROFILE_WITH_ROLES_SELECT)
    .order('last_name')
  if (error) throw error
  return (data ?? []).map(mapProfileWithRoles)
}

export async function findProfileById(
  db: SupabaseClient<Database>,
  id: string
): Promise<ProfileWithRoles | null> {
  const { data, error } = await db
    .from('profiles')
    .select(PROFILE_WITH_ROLES_SELECT)
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data ? mapProfileWithRoles(data) : null
}

export async function updateProfile(
  db: SupabaseClient<Database>,
  id: string,
  updates: ProfileUpdate
): Promise<ProfileRow> {
  const { data, error } = await db
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProfile(
  db: SupabaseClient<Database>,
  id: string
): Promise<void> {
  const { error } = await db.from('profiles').delete().eq('id', id)
  if (error) throw error
}
