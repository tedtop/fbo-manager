import { initialsConflictMessage, normalizeInitials } from '@/lib/fueler-initials'
import { normalizePhone } from '@/lib/phone-mask'
import { updateProfile } from '@/repositories/profiles.repo'
import { setUserRoles } from '@/repositories/user-roles.repo'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Full numbers are stored masked; an unchanged legacy value (not 10 digits) is kept as written. */
function normalizePhoneForSave(raw: string): string {
  return normalizePhone(raw) || raw.trim()
}

export interface InviteUserInput {
  email: string
  firstName: string
  lastName: string
  phoneNumber: string
  employeeId: string
  badgeId: string
  initials: string
  hireDate: string
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

/** B78: set a staff account's real email (optionally absorbing an Awaiting-access Google sign-up). */
export async function setStaffEmail(
  id: string,
  email: string,
  linkFromUserId?: string
): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, linkFromUserId })
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to set email')
  }
}

export interface UpdateUserInput {
  firstName: string
  lastName: string
  phoneNumber: string
  employeeId: string
  badgeId: string
  initials: string
  hireDate: string
  roleIds: number[]
}

/** Update a user's profile fields and replace their role assignments in one call. */
export async function updateUserWithRoles(
  db: SupabaseClient<Database>,
  userId: string,
  input: UpdateUserInput,
  updatedBy: string | null
): Promise<void> {
  try {
    await updateProfile(db, userId, {
    first_name: input.firstName,
    last_name: input.lastName,
    phone_number: normalizePhoneForSave(input.phoneNumber),
    employee_id: input.employeeId || null,
    badge_id: input.badgeId || null,
    initials: normalizeInitials(input.initials) || null,
    hire_date: input.hireDate || null,
    updated_by: updatedBy
  })
  } catch (err) {
    const message = initialsConflictMessage(err as { code?: string; message?: string })
    if (message) throw new Error(message)
    throw err
  }
  await setUserRoles(db, userId, input.roleIds, updatedBy)
}

/** B107: save one table cell. Same repository path and audit field (updated_by) as the Edit User sheet, no role change. */
export async function updateUserFields(
  db: SupabaseClient<Database>,
  userId: string,
  patch: Partial<{
    first_name: string
    last_name: string
    phone_number: string
    hire_date: string | null
    employee_id: string | null
    badge_id: string | null
    initials: string | null
  }>,
  updatedBy: string | null
): Promise<void> {
  try {
    await updateProfile(db, userId, { ...patch, updated_by: updatedBy })
  } catch (err) {
    const message = initialsConflictMessage(err as { code?: string; message?: string })
    if (message) throw new Error(message)
    throw err
  }
}

export async function setUserActiveStatus(
  db: SupabaseClient<Database>,
  userId: string,
  status: 'active' | 'disabled',
  updatedBy: string | null
): Promise<void> {
  await updateProfile(db, userId, { status, updated_by: updatedBy })
}
