import path from 'node:path'
import { chromium, type FullConfig } from '@playwright/test'
import { DEV_USERS, E2E_BASE_URL } from './support/env'
import { seedDevUsers } from './support/seed'

export const AUTH_DIR = path.join(__dirname, '.auth')
export const ADMIN_STORAGE_STATE = path.join(AUTH_DIR, 'admin.json')
export const USER_STORAGE_STATE = path.join(AUTH_DIR, 'user.json')

/**
 * Runs once before the whole E2E suite: seeds the two dev accounts the login form's
 * "Quick Dev Login" buttons already target, then logs each in through the real UI (real
 * Supabase Auth request, real cookies) and saves the resulting session so individual specs
 * can start already authenticated instead of re-logging-in every test.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await seedDevUsers()

  const browser = await chromium.launch()

  for (const [storageState, devUser] of [
    [ADMIN_STORAGE_STATE, DEV_USERS.admin],
    [USER_STORAGE_STATE, DEV_USERS.user],
  ] as const) {
    const page = await browser.newPage({ baseURL: E2E_BASE_URL })
    await page.goto('/login')
    await page.getByRole('button', { name: devUser === DEV_USERS.admin ? 'Log in as Admin' : 'Log in as User' }).click()
    await page.waitForURL(`${E2E_BASE_URL}/`, { timeout: 15_000 })
    await page.context().storageState({ path: storageState })
    await page.close()
  }

  await browser.close()
}
