import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

test.describe('Equipment form — create and edit actually persist', () => {
  test('Add Equipment form creates a real row in the database', async ({ page }) => {
    const equipmentId = uniqueValue('E2E-EQ-')
    const equipmentName = uniqueValue('E2E Fuel Truck ')

    await page.goto('/equipment')
    await page.getByRole('button', { name: 'Add Equipment' }).click()

    await page.getByLabel('Equipment ID').fill(equipmentId)
    await page.getByLabel('Name').fill(equipmentName)
    await page.getByLabel('Manufacturer').fill('E2E Manufacturer')
    await page.getByLabel('Model').fill('E2E Model')
    await page.getByRole('button', { name: 'Add Equipment' }).click()

    // The dialog closing on its own (no leftover error toast, no still-open sheet) is the
    // first signal the submit "succeeded" from the UI's point of view — exactly the point
    // where the known bug class hides: this can happen even if nothing was persisted.
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

    // The only proof that matters: a real row exists in the database with this data.
    const row = await waitForDbRow(async () => {
      const { data } = await db.from('equipment').select('*').eq('equipment_id', equipmentId).maybeSingle()
      return data
    })
    expect(row.equipment_name).toBe(equipmentName)
    expect(row.manufacturer).toBe('E2E Manufacturer')

    // And the UI list reflects the same row, not just a locally-optimistic one.
    await expect(page.getByText(equipmentName)).toBeVisible()
  })

  test('Editing equipment persists the change to the database', async ({ page }) => {
    const equipmentId = uniqueValue('E2E-EQ-EDIT-')
    const originalName = uniqueValue('E2E Original Name ')
    const updatedName = uniqueValue('E2E Updated Name ')

    const { error } = await db.from('equipment').insert({
      equipment_id: equipmentId,
      equipment_name: originalName,
      equipment_type: 'fuel_truck',
    })
    if (error) throw error

    await page.goto('/equipment')
    // Each card has its own "Edit" button (components/equipment/equipment-status-card.tsx)
    // — the name text itself isn't clickable, so scope to the specific card by its
    // distinguishing class and click that card's Edit button.
    const card = page.locator('.border-l-4').filter({ hasText: originalName })
    await card.getByRole('button', { name: 'Edit' }).click()

    const nameField = page.getByLabel('Name')
    await nameField.fill(updatedName)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

    const row = await waitForDbRow(async () => {
      const { data } = await db.from('equipment').select('*').eq('equipment_id', equipmentId).maybeSingle()
      return data?.equipment_name === updatedName ? data : null
    })
    expect(row.equipment_name).toBe(updatedName)
  })
})
