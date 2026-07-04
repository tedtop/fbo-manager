import { createClient } from '@supabase/supabase-js'
import {
  DEV_USERS,
  E2E_SUPABASE_SERVICE_ROLE_KEY,
  E2E_SUPABASE_URL,
  assertSafeE2ETarget,
} from './env'

/**
 * Idempotently creates the two "Quick Dev Login" accounts the login form already offers
 * (components/forms/login-form.tsx) via the Supabase Admin API, and grants each their role
 * per the `handle_new_auth_user` trigger defined in
 * frontend/supabase/migrations/20260703000200_user_management_schema.sql (which
 * auto-creates the `profiles` row — this only needs to add the `user_roles` grant on top).
 *
 * Safe to call every run: createUser on an existing email fails with a recognizable error
 * that this treats as "already seeded," so this doubles as the reset-then-reseed step after
 * `supabase db reset` and as a no-op on a stack that's already seeded.
 */
export async function seedDevUsers(): Promise<void> {
  assertSafeE2ETarget(E2E_SUPABASE_URL)

  const admin = createClient(E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  for (const { email, password, role } of Object.values(DEV_USERS)) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    let userId = created?.user?.id
    if (createError) {
      if (!/already been registered|already exists/i.test(createError.message)) {
        throw new Error(`seedDevUsers: failed to create ${email}: ${createError.message}`)
      }
      const { data: list, error: listError } = await admin.auth.admin.listUsers()
      if (listError) throw listError
      userId = list.users.find((u) => u.email === email)?.id
    }
    if (!userId) throw new Error(`seedDevUsers: could not resolve auth user id for ${email}`)

    const { data: roleRow, error: roleError } = await admin
      .from('roles')
      .select('id')
      .eq('name', role)
      .single()
    if (roleError) throw new Error(`seedDevUsers: role "${role}" not found: ${roleError.message}`)

    const { error: grantError } = await admin
      .from('user_roles')
      .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: 'user_id,role_id' })
    if (grantError) throw new Error(`seedDevUsers: failed to grant ${role} to ${email}: ${grantError.message}`)
  }
}
