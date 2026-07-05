import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { expectConventionalSheet } from './support/ui'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

test.describe('User management — roles, invites, and edits actually persist', () => {
  test('New Role form creates the role and its module permissions', async ({ page }) => {
    const roleName = uniqueValue('E2E Role ')

    await page.goto('/users/roles')
    await page.getByRole('button', { name: 'New Role' }).click()
    const sheet = await expectConventionalSheet(page)

    await sheet.getByLabel('Role Name').fill(roleName)
    await sheet.getByLabel('Description').fill('E2E role description')
    // Module Access selects render in MODULES order: Equipment first, Invoicing second.
    await sheet.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'Manage' }).click()
    await sheet.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'View only' }).click()
    await sheet.getByRole('button', { name: 'Create Role' }).click()

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const role = await waitForDbRow(async () => {
      const { data } = await db
        .from('roles')
        .select('*, module_permissions(*)')
        .eq('name', roleName)
        .maybeSingle()
      return data
    })
    expect(role.description).toBe('E2E role description')
    const perms = role.module_permissions as Array<{ module: string; access_level: string }>
    expect(perms).toHaveLength(2)
    expect(perms.find((p) => p.module === 'equipment')?.access_level).toBe('manage')
    expect(perms.find((p) => p.module === 'invoicing')?.access_level).toBe('view')
  })

  test('Invite User creates the auth user, profile, and role grant', async ({ page }) => {
    const email = `${uniqueValue('e2e-invite-')}@e2e.local`
    const lastName = uniqueValue('Invitee')

    await page.goto('/users')
    await page.getByRole('button', { name: 'Invite User' }).click()
    const sheet = await expectConventionalSheet(page)

    await sheet.getByLabel('Email').fill(email)
    await sheet.getByLabel('First Name').fill('E2E')
    await sheet.getByLabel('Last Name').fill(lastName)
    await sheet.getByLabel('Employee ID').fill('E2E-001')
    await sheet.getByRole('checkbox', { name: /Line Technician/ }).click()
    await sheet.getByRole('button', { name: 'Send Invite' }).click()

    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible({ timeout: 15_000 })

    // The invite API (service role, server side) must have created the profile with the
    // form's details and granted the checked role.
    const profile = await waitForDbRow(async () => {
      const { data } = await db
        .from('profiles')
        .select('*, user_roles(role:role_id(name))')
        .eq('email', email)
        .maybeSingle()
      return data
    })
    expect(profile.first_name).toBe('E2E')
    expect(profile.last_name).toBe(lastName)
    expect(profile.employee_id).toBe('E2E-001')
    const grants = profile.user_roles as Array<{ role: { name: string } }>
    expect(grants.map((g) => g.role.name)).toContain('Line Technician')
  })

  test('editing a user from the table persists profile changes', async ({ page }) => {
    // Seed an invitable user directly via the auth admin API (the handle_new_auth_user
    // trigger creates the profiles row).
    const email = `${uniqueValue('e2e-edit-')}@e2e.local`
    const { error: createError } = await db.auth.admin.createUser({
      email,
      password: 'not-a-real-login-1',
      email_confirm: true,
    })
    if (createError) throw createError

    const updatedFirst = uniqueValue('Edited')

    await page.goto('/users')
    const row = page.locator('tbody tr').filter({ hasText: email })
    await row.getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const sheet = await expectConventionalSheet(page)

    await sheet.getByLabel('First Name').fill(updatedFirst)
    await sheet.getByLabel('Last Name').fill('User')
    await sheet.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const profile = await waitForDbRow(async () => {
      const { data } = await db.from('profiles').select('*').eq('email', email).maybeSingle()
      return data?.first_name === updatedFirst ? data : null
    })
    expect(profile.first_name).toBe(updatedFirst)
    expect(profile.last_name).toBe('User')
  })
})
