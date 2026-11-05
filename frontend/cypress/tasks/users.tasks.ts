// Cypress tasks for the users-access spec. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient, waitForDbRow } from './db'

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

  /** Deletes the auth user (cascades to profile and user_roles). */
  async deleteAuthUser(userId: string) {
    const db = createE2EDbClient()
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) throw new Error(`deleteAuthUser: ${error.message}`)
    return null
  },
}
