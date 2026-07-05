import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { expectConventionalSheet } from './support/ui'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

async function seedFuelOrder(overrides: { fuel_request?: string } = {}) {
  const ticket = uniqueValue('E2E-TKT-')
  const { data, error } = await db
    .from('fuel_transaction')
    .insert({
      ticket_number: ticket,
      progress: 'started',
      source: 'manual',
      tail_number: `N${ticket.slice(-6).toUpperCase()}`,
      fuel_request: overrides.fuel_request ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Fuel orders only render in the "All" filter mode (default is "Airlines"). */
async function gotoFuelOrders(page: import('@playwright/test').Page) {
  await page.goto('/fuel-dispatch')
  await page.getByRole('button', { name: 'All', exact: true }).click()
}

test.describe('Fuel dispatch — orders, concurrency, and fueler assignment persist', () => {
  test('New Fuel Order form creates a real fuel_transaction row', async ({ page }) => {
    const ticket = uniqueValue('E2E-TKT-NEW-')

    await gotoFuelOrders(page)
    await page.getByRole('button', { name: 'New Fuel Order' }).click()
    await expectConventionalSheet(page)

    await page.getByLabel('Ticket Number').fill(ticket)
    await page.getByLabel('Tail Number').fill('N100E2E')
    await page.getByRole('radio', { name: 'Jet A', exact: true }).click()
    await page.getByLabel('Fuel Request').fill('T/O + 500')
    await page.getByLabel('Gallons').fill('500')
    await page.getByLabel('Lbs', { exact: true }).fill('3350')
    await page.getByRole('button', { name: 'Create Order' }).click()

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const row = await waitForDbRow(async () => {
      const { data } = await db
        .from('fuel_transaction')
        .select('*')
        .eq('ticket_number', ticket)
        .maybeSingle()
      return data
    })
    expect(row.tail_number).toBe('N100E2E')
    expect(row.fuel_type).toBe('jet_a')
    expect(row.fuel_request).toBe('T/O + 500')
    expect(Number(row.quantity_gallons)).toBe(500)
    expect(Number(row.quantity_lbs)).toBe(3350)
    // Density is derived client-side; 3350 / 500 = 6.7 must land in the DB too.
    expect(Number(row.density)).toBeCloseTo(6.7, 3)
    expect(row.progress).toBe('started')
    expect(row.source).toBe('manual')
  })

  test('a concurrent edit is detected on save and Overwrite anyway wins', async ({ page }) => {
    const seeded = await seedFuelOrder({ fuel_request: 'E2E original' })

    await gotoFuelOrders(page)
    const card = page.locator('[data-slot="card"]').filter({ hasText: seeded.ticket_number })
    await card.getByRole('button', { name: 'Edit order' }).click()
    await expectConventionalSheet(page)

    // Someone else saves while our sheet is open. The migration-applied BEFORE UPDATE
    // trigger bumps modified_at, which is what the save-time compare-and-swap keys on
    // (docs/edit-concurrency.md).
    const { error: concurrentError } = await db
      .from('fuel_transaction')
      .update({ fuel_request: 'E2E concurrent edit' })
      .eq('id', seeded.id)
    if (concurrentError) throw concurrentError

    await page.getByLabel('Gallons').fill('777')
    await page.getByRole('button', { name: 'Update Order' }).click()

    // The guarded write must match zero rows and surface the conflict dialog rather
    // than silently clobbering the other save.
    await expect(
      page.getByText('Someone else saved changes to this record')
    ).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Overwrite anyway' }).click()
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const row = await waitForDbRow(async () => {
      const { data } = await db
        .from('fuel_transaction')
        .select('*')
        .eq('id', seeded.id)
        .maybeSingle()
      return data?.quantity_gallons != null ? data : null
    })
    expect(Number(row.quantity_gallons)).toBe(777)
    // Overwrite semantics: our form state (loaded before the concurrent edit) replaces
    // the concurrent value wholesale.
    expect(row.fuel_request).toBe('E2E original')
  })

  test('assigning a fueler persists the assignment and starts the order', async ({ page }) => {
    const seeded = await seedFuelOrder()
    const fuelerName = uniqueValue('E2E Fueler ')
    const { data: fuelerUser, error: userError } = await db
      .from('users')
      .insert({
        username: uniqueValue('e2e-fueler-'),
        password: 'not-a-real-login',
        first_name: 'E2E',
        last_name: 'Fueler',
        role: 'line',
        is_active_fueler: true,
      })
      .select()
      .single()
    if (userError) throw userError
    const { data: fueler, error: fuelerError } = await db
      .from('fueler')
      .insert({ user_id: fuelerUser.id, fueler_name: fuelerName, status: 'active' })
      .select()
      .single()
    if (fuelerError) throw fuelerError

    await gotoFuelOrders(page)
    const card = page.locator('[data-slot="card"]').filter({ hasText: seeded.ticket_number })
    await card.getByRole('button', { name: 'Assign' }).click()
    const sheet = await expectConventionalSheet(page)

    await sheet.getByRole('button', { name: fuelerName }).click()
    // The row toggles to "Assigned" in the UI…
    await expect(sheet.getByText('Assigned')).toBeVisible()

    // …and the proof: a real fueler_assignment row plus the transaction flipped to
    // in_progress with assigned_at stamped.
    const assignment = await waitForDbRow(async () => {
      const { data } = await db
        .from('fueler_assignment')
        .select('*')
        .eq('transaction_id', seeded.id)
        .eq('fueler_id', fueler.id)
        .maybeSingle()
      return data
    })
    expect(assignment).toBeTruthy()

    const tx = await waitForDbRow(async () => {
      const { data } = await db
        .from('fuel_transaction')
        .select('*')
        .eq('id', seeded.id)
        .maybeSingle()
      return data?.progress === 'in_progress' ? data : null
    })
    expect(tx.assigned_at).not.toBeNull()
  })
})
