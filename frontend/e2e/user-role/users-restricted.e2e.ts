import { expect, test } from '@playwright/test'

/**
 * Runs under the `line-technician` Playwright project (e2e/user-role/** — see
 * playwright.config.ts): a signed-in non-admin. Proves restriction is enforced on both
 * surfaces — the page shell AND the server-side admin API — since a hidden button alone
 * is not access control.
 */
test.describe('User management is restricted for a line technician', () => {
  test('the users page shows Access Restricted instead of the user table', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByText('Access Restricted')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Invite User' })).not.toBeVisible()
  })

  test('the invite API rejects a non-admin session server-side', async ({ page }) => {
    // Use the browser context's real cookies against the real API route.
    const response = await page.request.post('/api/users/invite', {
      data: { email: 'sneaky@e2e.local' },
    })
    expect(response.status()).toBeGreaterThanOrEqual(401)
    expect(response.status()).toBeLessThan(500)
  })
})
