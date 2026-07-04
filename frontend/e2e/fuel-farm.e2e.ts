import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { expectConventionalSheet } from './support/ui'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/**
 * Fuel farm: tank CRUD (fuel_tank) and the on-card level-entry flow
 * (tank_level_readings). Note tank_level_readings is the app's own table — the
 * externally-owned `fuel_tank_readings` table this repo must never write to is a
 * different table and no frontend code touches it.
 */
test.describe('Fuel farm — tank forms and level readings actually persist', () => {
  test('New Tank form creates a real fuel_tank row', async ({ page }) => {
    const tankId = uniqueValue('E2E-T-')
    const tankName = uniqueValue('E2E Tank ')

    await page.goto('/fuel-farm')
    await page.getByRole('button', { name: 'New Tank' }).click()
    await expectConventionalSheet(page)

    await page.getByLabel('Tank ID').fill(tankId)
    await page.getByLabel('Tank Name').fill(tankName)
    await page.getByLabel('Capacity (Gallons)').fill('12000')
    await page.getByLabel('Min Level (inches)').fill('5')
    await page.getByLabel('Max Level (inches)').fill('100')
    await page.getByLabel('Usable Min (inches)').fill('10')
    await page.getByLabel('Usable Max (inches)').fill('90')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const row = await waitForDbRow(async () => {
      const { data } = await db.from('fuel_tank').select('*').eq('tank_id', tankId).maybeSingle()
      return data
    })
    expect(row.tank_name).toBe(tankName)
    expect(row.fuel_type).toBe('jet_a')
    expect(Number(row.capacity_gallons)).toBe(12000)
    expect(Number(row.usable_max_inches)).toBe(90)
  })

  test('editing a tank from its card persists the change', async ({ page }) => {
    const tankId = uniqueValue('E2E-T-ED-')
    const originalName = uniqueValue('E2E Original Tank ')
    const updatedName = uniqueValue('E2E Updated Tank ')

    const { error } = await db.from('fuel_tank').insert({
      tank_id: tankId,
      tank_name: originalName,
      fuel_type: 'jet_a',
      capacity_gallons: '5000',
      min_level_inches: '5',
      max_level_inches: '100',
      usable_min_inches: '10',
      usable_max_inches: '90',
    })
    if (error) throw error

    await page.goto('/fuel-farm')
    const card = page.locator('[data-slot="card"]').filter({ hasText: tankId })
    await card.getByRole('button', { name: 'Edit' }).click()
    await expectConventionalSheet(page)

    await page.getByLabel('Tank Name').fill(updatedName)
    await page.getByRole('button', { name: 'Update' }).click()

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const row = await waitForDbRow(async () => {
      const { data } = await db.from('fuel_tank').select('*').eq('tank_id', tankId).maybeSingle()
      return data?.tank_name === updatedName ? data : null
    })
    expect(row.tank_name).toBe(updatedName)
  })

  test('entering a level on a tank card creates a real tank_level_readings row', async ({
    page,
  }) => {
    const tankId = uniqueValue('E2E-T-LV-')
    const { error } = await db.from('fuel_tank').insert({
      tank_id: tankId,
      tank_name: `E2E Level Tank ${tankId}`,
      fuel_type: 'jet_a',
      capacity_gallons: '5000',
      min_level_inches: '5',
      max_level_inches: '100',
      usable_min_inches: '10',
      usable_max_inches: '90',
    })
    if (error) throw error

    await page.goto('/fuel-farm')
    const card = page.locator('[data-slot="card"]').filter({ hasText: tankId })
    await card.getByPlaceholder('Level (inches)').fill('42.5')
    await card.getByRole('button', { name: 'Update', exact: true }).click()

    // The card shows a transient success message, but the row is the proof.
    const reading = await waitForDbRow(async () => {
      const { data } = await db
        .from('tank_level_readings')
        .select('*')
        .eq('tank_id', tankId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    })
    expect(Number(reading.level)).toBeCloseTo(42.5, 2)

    // And the card reflects the persisted reading, not just local state.
    await expect(card.getByText('42.5"')).toBeVisible()
  })
})
