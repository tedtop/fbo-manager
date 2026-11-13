// Cypress tasks for the creator-attribution spec (B17; service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const flightCreatorTasks = {
  /**
   * The legacy `users` row the app links to a signed-in account by email (useCurrentUser / resolveCreatorId).
   * The dev accounts have none on a fresh stack: reuse an existing row for the email, else insert one.
   * Rows are left in place (other specs may share the admin row).
   */
  async ensureUsersRowForEmail({ email, username, firstName, lastName, role }: {
    email: string
    username: string
    firstName: string
    lastName: string
    role: 'admin' | 'line' | 'frontdesk'
  }) {
    const db = createE2EDbClient()
    const { data: existing, error: findError } = await db
      .from('users')
      .select('id, first_name, last_name, role')
      .eq('email', email)
      .maybeSingle()
    if (findError) throw new Error(`ensureUsersRowForEmail: ${findError.message}`)
    if (existing) return existing
    const { data, error } = await db
      .from('users')
      .insert({ username, email, password: 'x', first_name: firstName, last_name: lastName, role })
      .select('id, first_name, last_name, role')
      .single()
    if (error) throw new Error(`ensureUsersRowForEmail: ${error.message}`)
    return data
  },
}
