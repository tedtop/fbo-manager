import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findModuleAccessForUser } from '@/repositories/user-roles.repo'
import { type AccessLevel, type ModuleKey, accessAtLeast } from '@/types/domain/users'
import type { User } from '@supabase/supabase-js'

export type ModuleCheck =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string }

/**
 * Gate for API route handlers. middleware.ts skips auth for every /api/ path, so a route that spends
 * money (OCR) or reaches a third party (QT) has to check for itself. Passes only for a signed-in user
 * whose profile is active and who holds at least `level` on `module` through a role.
 *
 *   const check = await requireModule('truck_sheets')
 *   if (!check.ok) return denied(check)
 */
export async function requireModule(
  module: ModuleKey,
  level: AccessLevel = 'view'
): Promise<ModuleCheck> {
  const { check, supabase } = await activeUser()
  if (!check.ok) return check

  let access
  try {
    access = await findModuleAccessForUser(supabase as any, check.user.id)
  } catch (error) {
    console.error('requireModule: could not load module access', error)
    return { ok: false, status: 500, error: 'Could not verify access' }
  }
  if (!accessAtLeast(access, module, level)) {
    return { ok: false, status: 403, error: 'You do not have access to this module' }
  }

  return check
}

/** For routes any signed-in, active user may call regardless of module (e.g. the tail-number lookup). */
export async function requireActiveUser(): Promise<ModuleCheck> {
  return (await activeUser()).check
}

async function activeUser() {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, check: { ok: false, status: 401, error: 'Not authenticated' } as const }
  }

  // A disabled account keeps its roles but must not reach anything.
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.status !== 'active') {
    return { supabase, check: { ok: false, status: 403, error: 'Your account is not active' } as const }
  }

  return { supabase, check: { ok: true, user } as const }
}

/** The JSON error response for a failed {@link requireModule} check. */
export function denied(check: Extract<ModuleCheck, { ok: false }>): NextResponse {
  return NextResponse.json({ error: check.error }, { status: check.status })
}
