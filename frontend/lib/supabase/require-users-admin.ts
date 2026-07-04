import { createClient } from '@/lib/supabase/server'
import { findModuleAccessForUser } from '@/repositories/user-roles.repo'
import { accessAtLeast } from '@/types/domain/users'
import type { User } from '@supabase/supabase-js'

interface AuthorizedCaller {
  user: User
}

/**
 * Verifies the current request is from an authenticated user who holds
 * 'manage' access on the 'users' module. Route handlers that perform
 * admin-only user-management actions (invite, delete) must call this
 * before touching the service-role client.
 */
export async function requireUsersAdmin(): Promise<
  | { ok: true; caller: AuthorizedCaller }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }

  const access = await findModuleAccessForUser(supabase, user.id)
  if (!accessAtLeast(access, 'users', 'manage')) {
    return {
      ok: false,
      status: 403,
      error: 'You do not have permission to manage users'
    }
  }

  return { ok: true, caller: { user } }
}
