import { expect, test, type Page } from '@playwright/test'
import { createE2EDbClient } from './support/db'

const db = createE2EDbClient()

async function setPrefixInDb(prefix: string) {
  const { error } = await db
    .from('app_setting')
    .upsert({ key: 'tail_number_prefix', value: prefix }, { onConflict: 'key' })
  if (error) throw error
}

const tailInput = (page: Page) => page.getByPlaceholder('e.g., N12345')

async function openAddFlight(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add Flight' }).click()
  await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()
}

test.describe('Tail number prefix (Settings)', () => {
  test.beforeEach(async () => setPrefixInDb('N'))
  test.afterAll(async () => setPrefixInDb('N'))

  test('a new flight starts with N in the tail field and typing continues after it', async ({ page }) => {
    await openAddFlight(page)
    await expect(tailInput(page)).toHaveValue('N')
    // No click: the field is focused when the sheet opens, with the caret after the prefix.
    await page.keyboard.type('868cb')
    await expect(tailInput(page)).toHaveValue('N868CB')
  })

  test('the suggestion list stays closed until something is typed after the prefix', async ({ page }) => {
    await openAddFlight(page)
    await expect(tailInput(page)).toHaveValue('N')
    await expect(page.locator('div.absolute.z-50')).toHaveCount(0)
  })

  test('saving with only the prefix shows an inline message and creates nothing', async ({ page }) => {
    await openAddFlight(page)
    await page.locator('#arrivalTime').fill('10:00')
    await page.getByRole('button', { name: 'Add Flight', exact: true }).last().click()
    await expect(page.getByText('Enter the tail number')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()
  })

  test('changing the prefix in Settings changes the prefill (C-)', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.locator('#tailPrefix')).toHaveValue('N')

    await page.getByRole('button', { name: /^C-/ }).click()
    await expect(page.locator('#tailPrefix')).toHaveValue('C-')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()

    await openAddFlight(page)
    await expect(tailInput(page)).toHaveValue('C-')
  })

  test('an invalid prefix is rejected inline and cannot be saved', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('#tailPrefix').fill('N 1')
    await expect(page.locator('#tailPrefixError')).toContainText(/letters, numbers and hyphens/i)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  })

  test('an empty prefix means no prefill', async ({ page }) => {
    await setPrefixInDb('')
    await openAddFlight(page)
    await expect(tailInput(page)).toHaveValue('')
  })
})
