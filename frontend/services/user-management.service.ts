import { updateProfile } from '@/repositories/profiles.repo'
import { setUserRoles } from '@/repositories/user-roles.repo'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface InviteUserInput {
  email: string
  firstName: string
  lastName: string
  phoneNumber: string
  employeeId: string
  roleIds: number[]
}

export async function inviteUser(
  input: InviteUserInput
): Promise<{ id: string }> {
  const res = await fetch('/api/users/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Failed to invite user')
  return body
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to delete user')
  }
}

export interface UpdateUserInput {
  firstName: string
  lastName: string
  phoneNumber: string
  employeeId: string
  roleIds: number[]
}

/** Update a user's profile fields and replace their role assignments in one call. */
export async function updateUserWithRoles(
  db: SupabaseClient<Database>,
  userId: string,
  input: UpdateUserInput,
  updatedBy: string | null
): Promise<void> {
  await updateProfile(db, userId, {
    first_name: input.firstName,
    last_name: input.lastName,
    phone_number: input.phoneNumber,
    employee_id: input.employeeId || null,
    updated_by: updatedBy
  })
  await setUserRoles(db, userId, input.roleIds, updatedBy)
}

export async function setUserActiveStatus(
  db: SupabaseClient<Database>,
  userId: string,
  status: 'active' | 'disabled',
  updatedBy: string | null
): Promise<void> {
  await updateProfile(db, userId, { status, updated_by: updatedBy })
}
