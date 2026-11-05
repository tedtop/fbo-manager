import { expect, test } from '@playwright/test'
import { E2E_BASE_URL } from './support/env'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/**
 * New sign-ups (Google or email) have a profile and no role. They must be held on /pending until an
 * admin gives them one in the Users module. Google itself cannot run here (it needs Google's
 * servers), so the new account is created through the admin API; everything after the sign-in
 * redirect is the same path a Google user takes.
 */
test.describe('New sign-up access: pending page and promotion from Users', () => {
  test('a role-less user is held on /pending until an admin promotes them', async ({
    page,
    browser
  }) => {
    const email = `${uniqueValue('e2e-newhire-')}@example.com`
    const password = uniqueValue('pw-')

    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { given_name: 'Sam', family_name: 'Newhire' }
    })
    if (error || !created.user) throw error ?? new Error('createUser returned no user')
    const userId = created.user.id

    try {
      // Profile exists with the Google-style name split, and no role.
      const profile = await waitForDbRow(async () => {
        const { data } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()
        return data
      })
      expect([profile.first_name, profile.last_name]).toEqual(['Sam', 'Newhire'])
      const { data: roleRows } = await db.from('user_roles').select('id').eq('user_id', userId)
      expect(roleRows).toHaveLength(0)

      // The new user, in their own browser (no admin session).
      const newUserContext = await browser.newContext({
        baseURL: E2E_BASE_URL,
        storageState: { cookies: [], origins: [] }
      })
      const newUserPage = await newUserContext.newPage()
      await newUserPage.goto('/login')
      await newUserPage.getByLabel('Email').fill(email)
      await newUserPage.getByLabel('Password').fill(password)
      await newUserPage.getByRole('button', { name: 'Sign In', exact: true }).click()

      await expect(newUserPage).toHaveURL(/\/pending/)
      await expect(newUserPage.getByText('Waiting for access', { exact: true })).toBeVisible()

      // Direct navigation to a module bounces back to /pending too.
      await newUserPage.goto('/users')
      await expect(newUserPage).toHaveURL(/\/pending/)

      // The admin sees the sign-up at the top of Users, awaiting access, and promotes them.
      await page.goto('/users')
      const roleSelect = page.getByRole('combobox', { name: `Role for ${email}` })
      await expect(roleSelect).toContainText('Awaiting access')
      await roleSelect.focus()
      await page.keyboard.press('Space')
      await page.getByRole('option', { name: 'Front Desk' }).click()
      await expect(page.getByText(/is now Front Desk/)).toBeVisible()

      // Proof in the database, with the admin recorded as the assigner.
      const assignment = await waitForDbRow(async () => {
        const { data } = await db
          .from('user_roles')
          .select('assigned_by, roles(name)')
          .eq('user_id', userId)
          .maybeSingle()
        return data
      })
      expect((assignment.roles as unknown as { name: string }).name).toBe('Front Desk')
      expect(assignment.assigned_by).not.toBeNull()

      // The new user's next request lets them in: Check again leaves /pending, and Users stays closed.
      await newUserPage.getByRole('button', { name: 'Check again' }).click()
      await expect(newUserPage).not.toHaveURL(/\/pending/)
      await newUserPage.goto('/users')
      await expect(newUserPage).not.toHaveURL(/\/users/)

      await newUserContext.close()
    } finally {
      await db.auth.admin.deleteUser(userId)
    }
  })

  test('the login page offers Google sign-in', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: { cookies: [], origins: [] }
    })
    const loginPage = await context.newPage()
    await loginPage.goto('/login')
    await expect(loginPage.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await context.close()
  })
})
