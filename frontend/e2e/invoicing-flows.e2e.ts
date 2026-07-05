import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { expectConventionalSheet } from './support/ui'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/** Seeds an outstanding (E.O.M.-billed) invoice — the state settle/void act on. */
async function seedOpenInvoice() {
  const invoiceNumber = uniqueValue('E2E-OPEN-')
  const { data, error } = await db
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_name: `E2E Account ${invoiceNumber}`,
      status: 'open',
      payment_method: 'eom',
      total: 312.5,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Invoicing lifecycle beyond ticket creation (invoicing.e2e.ts): draft-save +
 * finalize-from-draft, account settlement, and voiding — the three flows that mutate an
 * existing invoice's status.
 */
test.describe('Invoicing lifecycle — draft, settle, void actually persist', () => {
  test('Save draft persists a draft, and completing it from the list finalizes the same invoice', async ({
    page,
  }) => {
    const truckId = uniqueValue('E2E-TRK-')
    const { error: truckError } = await db.from('equipment').insert({
      equipment_id: truckId,
      equipment_name: `E2E Truck ${truckId}`,
      equipment_type: 'fuel_truck',
    })
    if (truckError) throw truckError

    const invoiceNumber = uniqueValue('E2E-DFT-')
    const customerName = uniqueValue('E2E Draft Co ')

    await page.goto('/invoicing')
    await page.getByRole('button', { name: 'New ticket' }).click()
    await expectConventionalSheet(page)

    await page.getByLabel('Invoice #').fill(invoiceNumber)
    await page.getByRole('button', { name: 'Customer name' }).click()
    await page.getByPlaceholder('Search accounts or type a name…').fill(customerName)
    await page.getByText(new RegExp('as written')).click()
    await page.getByRole('combobox', { name: 'Fuel truck' }).click()
    await page.getByRole('option', { name: new RegExp(truckId) }).click()
    await page.getByLabel('Quantity (gal)').fill('100')
    await page.getByLabel('Price / gal').fill('5.50')

    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const draft = await waitForDbRow(async () => {
      const { data } = await db
        .from('invoices')
        .select('*')
        .eq('invoice_number', invoiceNumber)
        .maybeSingle()
      return data
    })
    expect(draft.status).toBe('draft')
    expect(draft.customer_name).toBe(customerName)

    // Reopen the draft from the list and complete it as a cash ticket.
    const row = page.locator('tbody tr').filter({ hasText: invoiceNumber })
    await row.getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Continue editing' }).click()
    await expectConventionalSheet(page)
    await page.locator('label[for="pay-cash"]').click()
    await page.getByRole('button', { name: 'Complete ticket' }).click()
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    // Same invoice number, now finalized: paid, correct total, exactly one invoice.
    const finalized = await waitForDbRow(async () => {
      const { data } = await db
        .from('invoices')
        .select('*, invoice_line_items(*)')
        .eq('invoice_number', invoiceNumber)
        .eq('status', 'paid')
        .maybeSingle()
      return data
    })
    expect(Number(finalized.total)).toBeCloseTo(100 * 5.5, 2)
    expect(finalized.invoice_line_items).toHaveLength(1)
    const { count } = await db
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('invoice_number', invoiceNumber)
    expect(count).toBe(1)
  })

  test('Record settlement marks an open account invoice paid with the settlement details', async ({
    page,
  }) => {
    const seeded = await seedOpenInvoice()

    await page.goto('/invoicing')
    const row = page.locator('tbody tr').filter({ hasText: seeded.invoice_number })
    await row.getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Record settlement' }).click()
    const sheet = await expectConventionalSheet(page)

    // "Check" is the default method; add the check number as the reference.
    await sheet.getByLabel('Reference (check #, confirmation, etc.)').fill('CHK-4471')
    await sheet.getByRole('button', { name: 'Confirm settlement' }).click()
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const settled = await waitForDbRow(async () => {
      const { data } = await db
        .from('invoices')
        .select('*')
        .eq('id', seeded.id)
        .maybeSingle()
      return data?.status === 'paid' ? data : null
    })
    expect(settled.settled_via).toBe('check')
    expect(settled.settlement_reference).toBe('CHK-4471')
    expect(settled.paid_at).not.toBeNull()
  })

  test('Void flips an open invoice to void', async ({ page }) => {
    const seeded = await seedOpenInvoice()

    await page.goto('/invoicing')
    // The void flow uses a native confirm() — accept it when it fires.
    page.on('dialog', (dialog) => dialog.accept())
    const row = page.locator('tbody tr').filter({ hasText: seeded.invoice_number })
    await row.getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Void' }).click()

    const voided = await waitForDbRow(async () => {
      const { data } = await db
        .from('invoices')
        .select('*')
        .eq('id', seeded.id)
        .maybeSingle()
      return data?.status === 'void' ? data : null
    })
    expect(voided.status).toBe('void')
  })
})
