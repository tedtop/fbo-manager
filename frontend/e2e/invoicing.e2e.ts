import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/**
 * This is the module the 2026-07-03 handoff explicitly flagged: "a POS/invoicing
 * ticket-entry form that renders and looks correct but silently doesn't persist to the
 * database." createInvoice() (repositories/invoices.repo.ts) does a multi-step write —
 * fueling event -> invoice -> line items -> gauge readings, with best-effort rollback since
 * supabase-js has no client transactions — driven entirely through client state in
 * components/invoicing/fuel-ticket-sheet.tsx. A repository-layer test can prove the
 * function works; only driving the actual form proves the UI actually calls it.
 */
test.describe('Fuel ticket entry — Complete ticket actually persists', () => {
  test('a digitally-entered fuel ticket creates a real invoice, line item, and fueling event', async ({
    page
  }) => {
    const truckId = uniqueValue('E2E-TRK-')
    const { error: truckError } = await db.from('equipment').insert({
      equipment_id: truckId,
      equipment_name: `E2E Truck ${truckId}`,
      equipment_type: 'fuel_truck'
    })
    if (truckError) throw truckError

    const invoiceNumber = uniqueValue('E2E-INV-')
    const customerName = uniqueValue('E2E Walk-up ')

    await page.goto('/invoicing')
    await page.getByRole('button', { name: 'New ticket' }).click()

    const invoiceNumberField = page.getByLabel('Invoice #')
    await invoiceNumberField.fill(invoiceNumber)

    // Customer combobox: write-in flow (no linked account needed for cash).
    await page.getByRole('button', { name: 'Customer name' }).click()
    await page
      .getByPlaceholder('Search accounts or type a name…')
      .fill(customerName)
    // Curly quotes in the source ("Use “X” as written") — match on the stable part only.
    await page.getByText(/as written/).click()

    // Fuel truck select (fuel delivery is on by default).
    await page.getByRole('combobox', { name: 'Fuel truck' }).click()
    await page.getByRole('option', { name: new RegExp(truckId) }).click()

    await page.getByLabel('Quantity (gal)').fill('150')
    await page.getByLabel('Price / gal').fill('6.25')

    // Click the (larger) <Label htmlFor="pay-cash"> rather than the sr-only radio input
    // itself — the radio's own hit area is small enough to occasionally get reported as
    // covered by the sheet's overlay during the Select's closing animation.
    await page.locator('label[for="pay-cash"]').click()

    await page.getByRole('button', { name: 'Complete ticket' }).click()

    // The sheet closing without a form error is the "looks like it worked" signal that
    // hid the original bug — the DB read below is what actually proves it.
    await expect(
      page.getByText('Invoice number and customer name are required')
    ).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Complete ticket' })
    ).not.toBeVisible({ timeout: 10_000 })

    const invoice = await waitForDbRow(async () => {
      const { data } = await db
        .from('invoices')
        .select('*, invoice_line_items(*)')
        .eq('invoice_number', invoiceNumber)
        .maybeSingle()
      return data
    })
    expect(invoice.customer_name).toBe(customerName)
    expect(invoice.status).toBe('paid') // finalize + cash => paid (see invoices.repo.ts statusFor())
    expect(Number(invoice.total)).toBeCloseTo(150 * 6.25, 2)

    const lineItems = invoice.invoice_line_items as Array<{
      item_type: string
      truck_meter_reading_id: number | null
      quantity: number
    }>
    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].item_type).toBe('fuel')
    expect(Number(lineItems[0].quantity)).toBe(150)

    // The fueling event itself: a real, independently-queryable truck_meter_readings row,
    // not just a client-side number that never made it to the database.
    const readingId = lineItems[0].truck_meter_reading_id
    expect(readingId).not.toBeNull()
    const { data: reading } = await db
      .from('truck_meter_readings')
      .select('*')
      .eq('id', readingId as number)
      .single()
    expect(reading?.gallons_pumped).toBe(150)
    expect(reading?.invoice_number).toBe(invoiceNumber)
  })
})
