import { expect, test, type Locator, type Page } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

// Fixed UTC-5 browser zone (no DST), same as flight-create, so time-related pins are deterministic.
test.use({ timezoneId: 'Etc/GMT+5' })

// One seeded flight per test so tests never interfere with each other. Departure-only rows
// (scheduled_arrival_time NULL) render as a single card, so tail-text locators are unambiguous.
const tailEdit = uniqueValue('NF2E').toUpperCase()
const tailStatus = uniqueValue('NF2E').toUpperCase()
const tailDelete = uniqueValue('NF2E').toUpperCase()
const tailConflict = uniqueValue('NF2E').toUpperCase()
const tailEditFail = uniqueValue('NF2E').toUpperCase()
const tailStatusFail = uniqueValue('NF2E').toUpperCase()
const tailCancel = uniqueValue('NF2E').toUpperCase()
const tailDeparted = uniqueValue('NF2E').toUpperCase()
const tails = [tailEdit, tailStatus, tailDelete, tailConflict, tailEditFail, tailStatusFail, tailCancel, tailDeparted]
const ids: Record<string, number> = {}
let userId: number

test.beforeAll(async () => {
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-flight-edit-user-'),
      password: 'test-password-hash',
      first_name: 'E2E',
      last_name: 'Edit',
      role: 'line',
    })
    .select()
    .single()
  if (userError) throw userError
  userId = user.id

  const { error: aircraftError } = await db
    .from('aircraft')
    .insert(tails.map((tail_number) => ({ tail_number, aircraft_type_icao: 'B738', aircraft_type_display: 'Boeing 737-800' })))
  if (aircraftError) throw aircraftError

  const departure = new Date(Date.now() + 6 * 3_600_000).toISOString()
  const { data: flights, error: flightError } = await db
    .from('flight')
    .insert(
      tails.map((aircraft_id) => ({
        aircraft_id,
        created_by_id: userId,
        origin: 'KAAA',
        destination: 'KBBB',
        scheduled_departure_time: departure,
        flight_status: aircraft_id === tailDeparted ? ('departed' as const) : ('scheduled' as const),
      }))
    )
    .select('id, aircraft_id')
  if (flightError) throw flightError
  for (const f of flights ?? []) ids[f.aircraft_id as string] = f.id
})

test.afterAll(async () => {
  await db.from('flight').delete().in('aircraft_id', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
  await db.from('users').delete().eq('id', userId)
})

const card = (page: Page, tail: string): Locator => page.locator('[data-slot="card"]').filter({ hasText: tail })

async function openBoard(page: Page, tail: string) {
  await page.goto('/')
  await expect(page.getByText(tail).first()).toBeVisible({ timeout: 15_000 })
}

async function openEditSheet(page: Page, tail: string) {
  await card(page, tail).getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeVisible()
}

const toastLocator = (page: Page, text: string): Locator => page.getByRole('status').filter({ hasText: text })

// Fails every PATCH to /rest/v1/flight (update / status change) with a PostgREST-style 500.
async function failFlightUpdates(page: Page) {
  await page.route(/\/rest\/v1\/flight(\?|$)/, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: 'forced e2e failure', details: null, hint: null })
        })
      : route.continue()
  )
}

async function readFlight(tail: string) {
  const { data, error } = await db.from('flight').select('*').eq('id', ids[tail]).single()
  if (error) throw error
  return data
}

test.describe('Flight edit, status change, delete', () => {
  test('edit dialog persists changed fields to the DB', async ({ page }) => {
    const before = await readFlight(tailEdit)
    await openBoard(page, tailEdit)
    await openEditSheet(page, tailEdit)

    // The form is pre-populated from the seeded row.
    await expect(page.locator('#origin')).toHaveValue('KAAA')
    await expect(page.locator('#destination')).toHaveValue('KBBB')

    await page.locator('#origin').fill('KTEB')
    await page.locator('#destination').fill('KASE')
    await page.locator('#contactName').fill('Edited Contact')
    await page.locator('#notes').fill('edited by e2e')
    await page.getByRole('checkbox', { name: 'Hangar' }).click()

    page.once('dialog', (d) => {
      throw new Error(`Unexpected alert: ${d.message()}`)
    })
    await page.getByRole('button', { name: 'Update Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeHidden({ timeout: 10_000 })
    await expect(toastLocator(page, 'Flight updated')).toBeVisible()

    const after = await waitForDbRow(async () => {
      const row = await readFlight(tailEdit)
      return row.origin === 'KTEB' ? row : null
    })
    expect(after.destination).toBe('KASE')
    expect(after.contact_name).toBe('Edited Contact')
    expect(after.notes).toBe('edited by e2e')
    expect(after.services).toContain('hangar')
    expect(after.flight_status).toBe('scheduled')
    expect(after.deleted_at).toBeNull()
    expect(after.modified_at).not.toBe(before.modified_at)

    await expect(card(page, tailEdit).getByText('KASE')).toBeVisible({ timeout: 15_000 })

    // NEW BUG (untagged in F1-F9, reported with B08): FlightCard seeds localNotes/localServices from props
    // with useState once, so after an edit the card keeps showing the old notes/services until reload.
    // Flips to visible-without-reload once the card derives them from props.
    await expect(card(page, tailEdit).getByText('edited by e2e')).toHaveCount(0)
    await page.reload()
    await expect(card(page, tailEdit).getByText('edited by e2e')).toBeVisible({ timeout: 15_000 })
  })

  test('status dropdown on the card persists the new status', async ({ page }) => {
    await openBoard(page, tailStatus)
    await expect(card(page, tailStatus).getByText('Scheduled', { exact: true })).toBeVisible()

    await card(page, tailStatus).getByText('Scheduled', { exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delayed' }).click()
    await expect(toastLocator(page, 'Flight updated')).toBeVisible()

    const row = await waitForDbRow(async () => {
      const r = await readFlight(tailStatus)
      return r.flight_status === 'delayed' ? r : null
    })
    expect(row.origin).toBe('KAAA') // untouched fields survive a status-only update
    expect(row.deleted_at).toBeNull()
    await expect(card(page, tailStatus).getByText('Delayed', { exact: true })).toBeVisible({ timeout: 15_000 })

    // Survives a reload (i.e. really came from the DB, not local state).
    await page.reload()
    await expect(card(page, tailStatus).getByText('Delayed', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test('delete removes the card and soft-deletes the row', async ({ page }) => {
    await openBoard(page, tailDelete)
    await card(page, tailDelete).getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('alertdialog')).toContainText(`Delete ${tailDelete}?`)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText(tailDelete)).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText('Flight deleted', { exact: true })).toBeVisible()

    const row = await waitForDbRow(async () => {
      const r = await readFlight(tailDelete)
      return r.deleted_at ? r : null
    })
    // Soft delete: the row is still there, just stamped.
    expect(row.id).toBe(ids[tailDelete])
    expect(row.aircraft_id).toBe(tailDelete)

    await page.reload()
    await expect(page.getByText(tailConflict).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(tailDelete)).toHaveCount(0)
  })

  test('cancelling the delete confirmation leaves the card and the row untouched', async ({ page }) => {
    await openBoard(page, tailCancel)
    await card(page, tailCancel).getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(`Delete ${tailCancel}?`)
    await expect(dialog).toContainText('removed from the board')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    await expect(card(page, tailCancel)).toBeVisible()
    expect((await readFlight(tailCancel)).deleted_at).toBeNull()
    await page.reload()
    await expect(card(page, tailCancel)).toBeVisible({ timeout: 15_000 })
  })

  test('a departed flight uses the same Delete wording and soft-deletes after confirming', async ({ page }) => {
    await openBoard(page, tailDeparted)
    await expect(card(page, tailDeparted).getByRole('button', { name: 'Clear' })).toHaveCount(0)
    await card(page, tailDeparted).getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(`Delete ${tailDeparted}?`)
    await dialog.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('Flight deleted', { exact: true })).toBeVisible()
    await expect(page.getByText(tailDeparted)).toHaveCount(0, { timeout: 15_000 })
    const row = await waitForDbRow(async () => {
      const r = await readFlight(tailDeparted)
      return r.deleted_at ? r : null
    })
    expect(row.id).toBe(ids[tailDeparted])
  })

  test('edit conflict: row changed behind the dialog shows the conflict UI and keeps the other write', async ({ page }) => {
    const before = await readFlight(tailConflict)
    await openBoard(page, tailConflict)
    await openEditSheet(page, tailConflict)
    await expect(page.locator('#origin')).toHaveValue('KAAA')

    // Someone else saves the same row while our dialog is open (modified_at trigger bumps it).
    const { error } = await db.from('flight').update({ notes: 'changed by someone else' }).eq('id', ids[tailConflict])
    if (error) throw error
    const bumped = await readFlight(tailConflict)
    expect(bumped.modified_at).not.toBe(before.modified_at)

    await page.locator('#origin').fill('KJFK')
    await page.getByRole('button', { name: 'Update Flight' }).click()

    const conflictDialog = page.getByRole('alertdialog')
    await expect(conflictDialog).toContainText('Someone else saved changes to this record', { timeout: 10_000 })
    await expect(conflictDialog.getByRole('button', { name: 'Overwrite anyway' })).toBeVisible()
    await expect(conflictDialog.getByRole('button', { name: 'Reload their changes' })).toBeVisible()

    // The compare-and-swap rejected our write: origin is unchanged, the other write is intact.
    const after = await readFlight(tailConflict)
    expect(after.origin).toBe('KAAA')
    expect(after.notes).toBe('changed by someone else')
    expect(after.modified_at).toBe(bumped.modified_at)

    // Reload their changes: form repopulates from the DB, our edit is discarded, nothing is written.
    await conflictDialog.getByRole('button', { name: 'Reload their changes' }).click()
    await expect(conflictDialog).toBeHidden()
    await expect(page.locator('#origin')).toHaveValue('KAAA')
    await expect(page.locator('#notes')).toHaveValue('changed by someone else')
    expect((await readFlight(tailConflict)).modified_at).toBe(bumped.modified_at)
  })

  test('failed edit shows an error toast, keeps the sheet open with the typed input, writes nothing', async ({ page }) => {
    const before = await readFlight(tailEditFail)
    await openBoard(page, tailEditFail)
    await openEditSheet(page, tailEditFail)
    await failFlightUpdates(page)
    page.on('dialog', (d) => {
      throw new Error(`Unexpected alert: ${d.message()}`)
    })

    await page.locator('#origin').fill('KFAIL')
    await page.getByRole('button', { name: 'Update Flight' }).click()

    const toast = toastLocator(page, "Couldn't update flight")
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('forced e2e failure')
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeVisible()
    await expect(page.locator('#origin')).toHaveValue('KFAIL')
    const after = await readFlight(tailEditFail)
    expect(after.origin).toBe('KAAA')
    expect(after.modified_at).toBe(before.modified_at)
  })

  test('failed status change shows an error toast and the status is unchanged', async ({ page }) => {
    await openBoard(page, tailStatusFail)
    await failFlightUpdates(page)
    await card(page, tailStatusFail).getByText('Scheduled', { exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delayed' }).click()

    const toast = toastLocator(page, "Couldn't update flight")
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('forced e2e failure')
    expect((await readFlight(tailStatusFail)).flight_status).toBe('scheduled')
  })
})
