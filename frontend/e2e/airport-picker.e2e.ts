import { expect, test } from '@playwright/test'
import { createE2EDbClient } from './support/db'

// The airport combobox, mounted as the Settings "Home airport" picker (it is not wired into a flight
// form yet). Needs the airport seed in the local database.
const db = createE2EDbClient()

async function setHomeAirport(code: string) {
  const { error } = await db
    .from('app_setting')
    .upsert({ key: 'home_airport', value: code }, { onConflict: 'key' })
  if (error) throw error
}

test.describe('Airport picker (Settings home airport)', () => {
  test.beforeEach(async () => setHomeAirport('KMSO'))
  test.afterAll(async () => setHomeAirport('KMSO'))

  test('GPI lists Glacier Park first and Guapi second; picking Glacier saves KGPI and survives a reload', async ({
    page
  }) => {
    await page.goto('/settings')
    const picker = page.locator('#homeAirport')
    await expect(picker).toContainText('Missoula')

    await picker.click()
    await page.getByPlaceholder(/Code or name/).fill('GPI')

    const options = page.locator('[cmdk-item]')
    await expect(options.filter({ hasText: 'Glacier Park Intl' })).toHaveCount(
      1
    )
    await expect(options.filter({ hasText: 'Guapi' })).toHaveCount(1)
    await expect(
      page.getByText('GPI matches more than one airport')
    ).toBeVisible()
    await expect(options.first()).toContainText('KGPI · FCA · GPI')
    await expect(options.nth(1)).toContainText('SKGP · GPI')

    await options.filter({ hasText: 'Glacier Park Intl' }).click()
    await expect(
      page.getByText('Settings saved', { exact: true })
    ).toBeVisible()

    await page.reload()
    await expect(page.locator('#homeAirport')).toContainText('Glacier Park')

    const { data, error } = await db
      .from('app_setting')
      .select('value')
      .eq('key', 'home_airport')
      .single()
    if (error) throw error
    expect(data.value).toBe('KGPI')
  })

  test('an unknown strip can be used as typed', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('#homeAirport').click()
    await page.getByPlaceholder(/Code or name/).fill('ZZ9X')
    await page.getByRole('option', { name: 'Use "ZZ9X" as typed' }).click()
    await expect(
      page.getByText('Settings saved', { exact: true })
    ).toBeVisible()
    await page.reload()
    await expect(page.locator('#homeAirport')).toContainText('ZZ9X')
  })
})
