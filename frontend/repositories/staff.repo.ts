import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * An employee row in the training matrix.
 *
 * Employees are the existing Django `users` records, sourced through active
 * `department_member` rows (the staff roster the line-schedule module is
 * built on). A user belonging to multiple departments appears once.
 */
export interface StaffMember {
  userId: number
  firstName: string
  lastName: string
  username: string
  title: string
  displayOrder: number
}

export function staffDisplayName(
  s: Pick<StaffMember, 'firstName' | 'lastName' | 'username'>
): string {
  const full = `${s.firstName} ${s.lastName}`.trim()
  return full || s.username
}

export async function findActiveStaff(
  db: SupabaseClient<Database>
): Promise<StaffMember[]> {
  const { data, error } = await db
    .from('department_member')
    .select(
      'user_id, title, display_order, is_active, user:user_id ( id, first_name, last_name, username, is_active )'
    )
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error

  const seen = new Set<number>()
  const staff: StaffMember[] = []
  for (const row of data as unknown as Array<{
    user_id: number
    title: string
    display_order: number
    user: {
      id: number
      first_name: string
      last_name: string
      username: string
      is_active: boolean
    } | null
  }>) {
    if (!row.user || !row.user.is_active || seen.has(row.user_id)) continue
    seen.add(row.user_id)
    staff.push({
      userId: row.user_id,
      firstName: row.user.first_name,
      lastName: row.user.last_name,
      username: row.user.username,
      title: row.title,
      displayOrder: row.display_order
    })
  }

  staff.sort(
    (a, b) =>
      a.displayOrder - b.displayOrder ||
      staffDisplayName(a).localeCompare(staffDisplayName(b))
  )
  return staff
}
