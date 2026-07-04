import type { Database, Tables, TablesUpdate } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRow = Tables<'users'>
export type UserUpdate = TablesUpdate<'users'>

export async function findAllUsers(
  db: SupabaseClient<Database>
): Promise<UserRow[]> {
  const { data, error } = await db
    .from('users')
    .select(
      'id, username, email, first_name, last_name, role, phone_number, employee_id, is_active_fueler, is_active, created_at, modified_at'
    )
    .order('username')
  if (error) throw error
  return data as UserRow[]
}

export async function findUserById(
  db: SupabaseClient<Database>,
  id: number
): Promise<UserRow | null> {
  const { data, error } = await db
    .from('users')
    .select(
      'id, username, email, first_name, last_name, role, phone_number, employee_id, is_active_fueler, is_active, created_at, modified_at'
    )
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as UserRow | null
}

export async function findUserByEmail(
  db: SupabaseClient<Database>,
  email: string
): Promise<UserRow | null> {
  const { data, error } = await db
    .from('users')
    .select(
      'id, username, email, first_name, last_name, role, phone_number, employee_id, is_active_fueler, is_active, created_at, modified_at'
    )
    .eq('email', email)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as UserRow | null
}

export async function updateUser(
  db: SupabaseClient<Database>,
  id: number,
  updates: UserUpdate
): Promise<UserRow> {
  const { data, error } = await db
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as UserRow
}
