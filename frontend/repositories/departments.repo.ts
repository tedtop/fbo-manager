import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'

export type DepartmentRow = Tables<'department'>
export type DepartmentMemberRow = Tables<'department_member'>

export type MemberWithUser = DepartmentMemberRow & {
  user: {
    id: number
    username: string
    first_name: string
    last_name: string
    employee_id: string | null
    role: 'admin' | 'line' | 'frontdesk'
  } | null
}

const MEMBER_SELECT = `*, user:user_id ( id, username, first_name, last_name, employee_id, role )`

export async function findActiveDepartments(
  db: SupabaseClient<Database>
): Promise<DepartmentRow[]> {
  const { data, error } = await db
    .from('department')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function findDepartmentBySlug(
  db: SupabaseClient<Database>,
  slug: string
): Promise<DepartmentRow | null> {
  const { data, error } = await db
    .from('department')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findActiveMembers(
  db: SupabaseClient<Database>,
  departmentId: number
): Promise<MemberWithUser[]> {
  const { data, error } = await db
    .from('department_member')
    .select(MEMBER_SELECT)
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error
  return data as unknown as MemberWithUser[]
}
