// Cypress tasks for the users-access spec. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createClient } from '@supabase/supabase-js'
import { createE2EDbClient, waitForDbRow } from './db'
import { E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_URL } from './env'

export const usersTasks = {
  /** Creates a confirmed, role-less auth user with Google-style name metadata (the handle_new_auth_user trigger makes the profile). Returns the user id. */
  async createNewHireUser({ email, password, givenName, familyName }: { email: string; password: string; givenName: string; familyName: string }) {
    const db = createE2EDbClient()
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { given_name: givenName, family_name: familyName },
    })
    if (error || !data.user) throw new Error(`createNewHireUser: ${error?.message ?? 'no user returned'}`)
    return data.user.id
  },

  /** Creates a confirmed auth user holding exactly one named role (e.g. 'Front Desk'). Returns the user id; remove with deleteAuthUser. */
  async createUserWithRole({ email, password, role }: { email: string; password: string; role: string }) {
    const db = createE2EDbClient()
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(`createUserWithRole: ${error?.message ?? 'no user returned'}`)
    const { data: roleRow, error: roleError } = await db.from('roles').select('id').eq('name', role).single()
    if (roleError) throw new Error(`createUserWithRole: role "${role}" not found: ${roleError.message}`)
    await waitForDbRow(async () => {
      const { data: profile } = await db.from('profiles').select('id').eq('id', data.user.id).maybeSingle() // made by the handle_new_auth_user trigger
      return profile
    })
    const { error: grantError } = await db.from('user_roles').upsert({ user_id: data.user.id, role_id: roleRow.id }, { onConflict: 'user_id,role_id' })
    if (grantError) throw new Error(`createUserWithRole: grant failed: ${grantError.message}`)
    return data.user.id
  },

  /** The profiles row for a user (waits for the trigger to create it) plus how many user_roles rows they have. */
  async getProfileAndRoleCount(userId: string) {
    const db = createE2EDbClient()
    const profile = await waitForDbRow(async () => {
      const { data } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()
      return data
    })
    const { data: roleRows, error } = await db.from('user_roles').select('id').eq('user_id', userId)
    if (error) throw new Error(`getProfileAndRoleCount: ${error.message}`)
    return { firstName: profile.first_name, lastName: profile.last_name, roleCount: roleRows?.length ?? 0 }
  },

  /** The user's role assignment once it exists (waits): role name and who assigned it. */
  async getRoleAssignment(userId: string) {
    const db = createE2EDbClient()
    const assignment = await waitForDbRow(async () => {
      const { data } = await db.from('user_roles').select('assigned_by, roles(name)').eq('user_id', userId).maybeSingle()
      return data
    })
    return { roleName: (assignment.roles as unknown as { name: string }).name, assignedBy: assignment.assigned_by ?? null }
  },

  /** Names of every role the user holds, sorted. */
  async getRoleNames(userId: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('user_roles').select('roles(name)').eq('user_id', userId)
    if (error) throw new Error(`getRoleNames: ${error.message}`)
    return (data ?? []).map((r) => (r.roles as unknown as { name: string }).name).sort()
  },

  /** Deletes the auth user (cascades to profile and user_roles). */
  async deleteAuthUser(userId: string) {
    const db = createE2EDbClient()
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) throw new Error(`deleteAuthUser: ${error.message}`)
    return null
  },

  /** B78: a staff account as seeded on live: auth user with a placeholder email + password, profile, and a `users` staff row with the same email. */
  async createStaffAccount({ email, password, firstName, lastName }: { email: string; password: string; firstName: string; lastName: string }) {
    const db = createE2EDbClient()
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })
    if (error || !data.user) throw new Error(`createStaffAccount: ${error?.message ?? 'no user returned'}`)
    const { data: staff, error: staffError } = await db
      .from('users')
      .insert({ username: email, email, first_name: firstName, last_name: lastName, password: '!' })
      .select('id')
      .single()
    if (staffError) throw new Error(`createStaffAccount (users row): ${staffError.message}`)
    return { authId: data.user.id, staffRowId: staff.id }
  },

  /** B78: where the email lives now: auth user, profiles row, staff `users` row (null when a row is gone). */
  async getEmailState({ authId, staffRowId }: { authId: string; staffRowId: number }) {
    const db = createE2EDbClient()
    const { data: auth } = await db.auth.admin.getUserById(authId)
    const { data: profile } = await db.from('profiles').select('email').eq('id', authId).maybeSingle()
    const { data: staff } = await db.from('users').select('email').eq('id', staffRowId).maybeSingle()
    return { authEmail: auth.user?.email ?? null, profileEmail: profile?.email ?? null, staffEmail: staff?.email ?? null }
  },

  /** B107: the profile fields the Users table edits, plus who last changed the row. */
  async getProfileFields(userId: string) {
    const db = createE2EDbClient()
    const { data, error } = await db
      .from('profiles')
      .select('first_name, last_name, phone_number, employee_id, badge_id, hire_date, updated_by')
      .eq('id', userId)
      .single()
    if (error) throw new Error(`getProfileFields: ${error.message}`)
    return data
  },

  /** B78: does this auth user still exist? */
  async authUserExists(userId: string) {
    const db = createE2EDbClient()
    const { data } = await db.auth.admin.getUserById(userId)
    return Boolean(data.user)
  },

  /** B78: true when email + password sign in successfully (anon client, local stack). */
  async canSignInWithPassword({ email, password }: { email: string; password: string }) {
    const anon = createClient(E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email, password })
    return !error && Boolean(data.session)
  },

  /** B78: remove a staff account and its `users` row. */
  async deleteStaffAccount({ authId, staffRowId }: { authId: string; staffRowId: number }) {
    const db = createE2EDbClient()
    await db.auth.admin.deleteUser(authId)
    await db.from('users').delete().eq('id', staffRowId)
    return null
  },
}
