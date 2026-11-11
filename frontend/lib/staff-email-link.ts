import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { normalizeEmail } from '@/lib/email'

/**
 * B78: put a staff member's real email on their existing staff account so their first
 * "Continue with Google" links to it (Supabase links a Google identity to the auth user that already
 * holds the same verified email). Server-only: takes the service-role client.
 *
 * Roles are never touched. An account holding a role is never deleted.
 */

export interface SetStaffEmailInput {
  /** Auth user id of the staff account that receives the real email. */
  targetId: string
  /** The real email (the Google address). */
  email: string
  /** Optional: the Awaiting-access Google sign-up to remove first (it currently holds `email`). */
  linkFromUserId?: string | null
  /** The admin making the change. */
  callerId: string
}

export type SetStaffEmailResult =
  | { ok: true; email: string; deletedUserId: string | null; staffRowUpdated: boolean }
  | { ok: false; status: number; error: string }

export { normalizeEmail }

/** Strong random password so the shared seed password stops working. */
export function randomPassword(): string {
  return randomBytes(24).toString('base64url')
}

const fail = (status: number, error: string): SetStaffEmailResult => ({ ok: false, status, error })

export async function setStaffRealEmail(
  admin: SupabaseClient<Database>,
  input: SetStaffEmailInput
): Promise<SetStaffEmailResult> {
  const email = normalizeEmail(input.email)
  if (!email) return fail(400, 'Enter a valid email address')

  const { targetId, callerId } = input
  const sourceId = input.linkFromUserId || null

  if (targetId === callerId) {
    return fail(400, "You can't change your own sign-in email here")
  }
  if (sourceId && (sourceId === targetId || sourceId === callerId)) {
    return fail(400, 'Pick a different account to link from')
  }

  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, email, status')
    .eq('id', targetId)
    .maybeSingle()
  if (targetErr) return fail(500, targetErr.message)
  if (!target) return fail(404, 'Staff account not found')

  const oldEmail = target.email
  if (oldEmail.toLowerCase() === email) {
    return fail(400, 'That account already uses this email')
  }

  if (sourceId) {
    const { data: source, error: sourceErr } = await admin
      .from('profiles')
      .select('id, email, status')
      .eq('id', sourceId)
      .maybeSingle()
    if (sourceErr) return fail(500, sourceErr.message)
    if (!source) return fail(404, 'The sign-up to link was not found')
    if (source.email.toLowerCase() !== email) {
      return fail(400, "The sign-up's email does not match the email to set")
    }
    const { data: roleRows, error: roleErr } = await admin
      .from('user_roles')
      .select('id')
      .eq('user_id', sourceId)
    if (roleErr) return fail(500, roleErr.message)
    if ((roleRows ?? []).length > 0) {
      return fail(409, 'That sign-up already has a role, so it is not an Awaiting-access account')
    }
  }

  // The email must not already belong to a different account (the Google sign-up being linked is the one allowed exception).
  const { data: clash, error: clashErr } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
  if (clashErr) return fail(500, clashErr.message)
  if ((clash ?? []).some((r) => r.id !== targetId && r.id !== sourceId)) {
    return fail(409, 'Another account already uses that email')
  }
  const { data: staffClash, error: staffClashErr } = await admin
    .from('users')
    .select('id')
    .ilike('email', email)
  if (staffClashErr) return fail(500, staffClashErr.message)
  if ((staffClash ?? []).length > 0) {
    return fail(409, 'A staff record already uses that email')
  }

  // 1. Free the email: remove the Awaiting-access Google account.
  if (sourceId) {
    const { error } = await admin.auth.admin.deleteUser(sourceId)
    if (error) return fail(400, error.message)
  }

  // 2. Real email (already verified by the admin) plus a random password.
  const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
    email,
    email_confirm: true,
    password: randomPassword()
  })
  if (authErr) return fail(400, authErr.message)

  // 3. Mirror the email into profiles and the staff `users` row.
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ email, updated_by: callerId })
    .eq('id', targetId)
  if (profileErr) {
    await admin.auth.admin.updateUserById(targetId, { email: oldEmail }).catch(() => undefined)
    return fail(500, profileErr.message)
  }

  const { data: staffRows, error: staffErr } = await admin
    .from('users')
    .update({ email })
    .ilike('email', oldEmail)
    .select('id')
  if (staffErr) return fail(500, `Sign-in email changed, but the staff record was not updated: ${staffErr.message}`)

  return {
    ok: true,
    email,
    deletedUserId: sourceId,
    staffRowUpdated: (staffRows ?? []).length > 0
  }
}
