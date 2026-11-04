import { expect, test, type Locator, type Page } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

// B26d: the service catalog end to end. Pills on the Add/Edit form and on the card come from the same
// `service` table, writes go through set_flight_services (flight_service junction + legacy flight.services).
const db = createE2EDbClient()

// Fixed UTC-5 browser zone (no DST), same as flight-edit, so the seeded times are deterministic.
test.use({ timezoneId: 'Etc/GMT+5' })

const tailCreate = uniqueValue('NSV').toUpperCase() // created through the Add Flight form
const tailEdit = uniqueValue('NSV').toUpperCase() // seeded with services, edited through the form
const tailFilterOn = uniqueValue('NSV').toUpperCase() // seeded with GPU
const tailFilterOff = uniqueValue('NSV').toUpperCase() // seeded without GPU
const tailNoConflict = uniqueValue('NSV').toUpperCase() // two edits in a row
const tailBilling = uniqueValue('NSV').toUpperCase() // placeholder aircraft for the form tests (never saved)
const tails = [tailCreate, tailEdit, tailFilterOn, tailFilterOff, tailNoConflict, tailBilling]
const ids: Record<string, number> = {}
let userId: number
let productId: number | null = null
const productName = uniqueValue('Ramp Fee ')

const LABELS: Record<string, string> = {
  fuel: 'Fuel',
  hangar: 'Hangar',
  catering: 'Catering',
  gpu: 'GPU',
  lav: 'Lav',
  oxygen: 'Oxygen',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance'
}
const labelsOf = (keys: string[]) => keys.map((k) => LABELS[k]).sort()

test.beforeAll(async () => {
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-flight-services-user-'),
      password: 'test-password-hash',
      first_name: 'E2E',
      last_name: 'Services',
      role: 'line'
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
  const seed = [tailEdit, tailFilterOn, tailFilterOff, tailNoConflict]
  const { data: flights, error: flightError } = await db
    .from('flight')
    .insert(
      seed.map((tail_number) => ({
        tail_number,
        created_by_id: userId,
        origin: 'KAAA',
        destination: 'KBBB',
        scheduled_departure_time: departure,
        flight_status: 'scheduled' as const
      }))
    )
    .select('id, tail_number')
  if (flightError) throw flightError
  for (const f of flights ?? []) ids[f.tail_number as string] = f.id

  for (const [tail, services] of [
    [tailEdit, ['fuel', 'lav', 'cleaning']],
    [tailFilterOn, ['gpu']],
    [tailNoConflict, ['hangar']]
  ] as const) {
    const { error } = await db.rpc('set_flight_services', { p_flight_id: ids[tail], p_services: [...services] })
    if (error) throw error
  }

  // A billable-only item: lives in `product`, must never become a pill or a filter option.
  const { data: product, error: productError } = await db
    .from('product')
    .insert({ name: productName, sku: uniqueValue('E2E-SVC-').toUpperCase(), price: 25, product_type: 'fee' })
    .select('id')
    .single()
  if (productError) throw productError
  productId = product.id
})

test.afterAll(async () => {
  // flight_service rows cascade with the flight.
  await db.from('flight').delete().in('tail_number', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
  if (productId !== null) await db.from('product').delete().eq('id', productId)
  await db.from('users').delete().eq('id', userId)
})

const card = (page: Page, tail: string): Locator =>
  page.locator('[data-slot="card"]').filter({ hasText: new RegExp(`${tail}(?![0-9])`) })

const toastLocator = (page: Page, text: string): Locator => page.getByRole('status').filter({ hasText: text })

async function openBoard(page: Page, tail: string) {
  await page.goto('/')
  await expect(page.getByText(tail).first()).toBeVisible({ timeout: 15_000 })
}

async function openEditSheet(page: Page, tail: string) {
  await card(page, tail).getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeVisible()
}

const pill = (page: Page, key: string) => page.locator(`button[data-service-key="${key}"]`)

// Junction rows (source of truth) as sorted catalog keys.
async function junctionKeys(tail: string): Promise<string[]> {
  const { data, error } = await db.from('flight_service').select('service_id').eq('flight_id', ids[tail])
  if (error) throw error
  const { data: services, error: serviceError } = await db
    .from('service')
    .select('key')
    .in('id', (data ?? []).map((r) => r.service_id))
  if (serviceError) throw serviceError
  return (services ?? []).map((r) => r.key).sort()
}

async function legacyServices(tail: string): Promise<string[]> {
  const { data, error } = await db.from('flight').select('services').eq('id', ids[tail]).single()
  if (error) throw error
  return [...(data.services ?? [])].sort()
}

const cardPillLabels = async (page: Page, tail: string) =>
  (await card(page, tail).locator('[data-service-key]').allTextContents()).map((t) => t.trim()).sort()

test.describe('Service catalog on the board, form and toolbar (B26)', () => {
  test('services picked in Add Flight (incl. GPU, Lav, Cleaning) show as the same pills on the card and in the junction', async ({ page }) => {
    const picked = ['fuel', 'gpu', 'lav', 'cleaning']
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()

    await page.getByPlaceholder('e.g., N12345').fill(tailCreate)
    await page.locator('#aircraftType').click()
    await page.getByPlaceholder('Search code or model (e.g. G650, GLF6)').fill('b738')
    await page.getByRole('option', { name: /B738/ }).first().click()
    await page.locator('#departureTime').fill('16:45') // departure only: one card, QT unchecks itself
    for (const key of picked) {
      await pill(page, key).click()
      await expect(pill(page, key)).toHaveAttribute('aria-pressed', 'true')
    }
    await page.getByRole('button', { name: 'Add Flight', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeHidden({ timeout: 10_000 })

    const flight = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('id').eq('tail_number', tailCreate).maybeSingle()
      return data
    })
    ids[tailCreate] = flight.id
    expect(await junctionKeys(tailCreate)).toEqual([...picked].sort())
    expect(await legacyServices(tailCreate)).toEqual([...picked].sort())

    await expect(card(page, tailCreate)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => cardPillLabels(page, tailCreate), { timeout: 15_000 }).toEqual(labelsOf(picked))
    // Same after a reload (read back through the junction embed).
    await page.reload()
    await expect(card(page, tailCreate)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => cardPillLabels(page, tailCreate), { timeout: 15_000 }).toEqual(labelsOf(picked))
  })

  test('edit form preselects the flight services; untoggle one, add one, save updates junction and card', async ({ page }) => {
    await openBoard(page, tailEdit)
    await openEditSheet(page, tailEdit)

    for (const key of ['fuel', 'lav', 'cleaning']) await expect(pill(page, key)).toHaveAttribute('aria-pressed', 'true')
    for (const key of ['gpu', 'oxygen', 'hangar']) await expect(pill(page, key)).toHaveAttribute('aria-pressed', 'false')

    await pill(page, 'lav').click() // remove
    await pill(page, 'oxygen').click() // add
    await expect(pill(page, 'lav')).toHaveAttribute('aria-pressed', 'false')
    await expect(pill(page, 'oxygen')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Update Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeHidden({ timeout: 10_000 })
    await expect(toastLocator(page, 'Flight updated')).toBeVisible()

    const expected = ['cleaning', 'fuel', 'oxygen']
    await expect.poll(() => junctionKeys(tailEdit), { timeout: 10_000 }).toEqual(expected)
    expect(await legacyServices(tailEdit)).toEqual(expected)
    await expect.poll(() => cardPillLabels(page, tailEdit), { timeout: 15_000 }).toEqual(labelsOf(expected))
    await expect(card(page, tailEdit).locator('[data-service-key="lav"]')).toHaveCount(0)
  })

  test('toolbar services filter lists the catalog, narrows the board and Clear resets it', async ({ page }) => {
    await openBoard(page, tailFilterOn)
    await expect(page.getByText(tailFilterOff).first()).toBeVisible()
    await page.getByRole('button', { name: 'Filters' }).click()
    const panel = page.getByRole('dialog')
    for (const label of ['GPU', 'Lav', 'Oxygen', 'Cleaning', 'Ground Transport']) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible()
    }

    await panel.getByText('GPU', { exact: true }).click()
    await expect(page.getByText(tailFilterOn).first()).toBeVisible()
    await expect(page.getByText(tailFilterOff)).toHaveCount(0)

    await panel.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByText(tailFilterOff).first()).toBeVisible()
    await expect(page.getByText(tailFilterOn).first()).toBeVisible()
  })

  test('a billable-only product never appears in the picker or the toolbar filter', async ({ page }) => {
    const { data: active, error } = await db.from('service').select('key').eq('active', true)
    if (error) throw new Error(`service catalog read: ${JSON.stringify(error)}`)
    const count = active?.length ?? 0
    expect(count).toBeGreaterThan(0)

    await openBoard(page, tailFilterOn)
    await page.getByRole('button', { name: 'Filters' }).click()
    const panel = page.getByRole('dialog')
    await expect(panel.getByText('GPU', { exact: true })).toBeVisible()
    await expect(panel.getByText(/Ramp Fee/)).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Add Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()
    await expect(page.locator('button[data-service-key]')).toHaveCount(count)
    await expect(page.getByRole('dialog').getByText(/Ramp Fee/)).toHaveCount(0)
  })

  test('catalog fetch failure shows the loading skeleton, then an empty picker, and the form keeps working', async ({ page }) => {
    // Only the service table (not flight_service); react-query retries 3 times before giving up.
    await page.route(/\/rest\/v1\/service(\?|$)/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'forced e2e catalog failure', details: null, hint: null })
      })
    )
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Flight' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()

    await expect(dialog.locator('[aria-busy="true"]')).toBeVisible()
    await expect(dialog.locator('[aria-busy="true"]')).toBeHidden({ timeout: 20_000 })
    await expect(dialog.locator('button[data-service-key]')).toHaveCount(0)

    // The rest of the form is unaffected.
    await expect(dialog.getByText('Services', { exact: true })).toBeVisible()
    await dialog.getByPlaceholder('e.g., N12345').fill(tailBilling)
    await expect(dialog.getByPlaceholder('e.g., N12345')).toHaveValue(tailBilling)
    await expect(dialog.getByRole('button', { name: 'Add Flight', exact: true })).toBeEnabled()
  })

  test('the next edit after a services edit has no false concurrency conflict', async ({ page }) => {
    await openBoard(page, tailNoConflict)
    await openEditSheet(page, tailNoConflict)
    await pill(page, 'gpu').click()
    await page.getByRole('button', { name: 'Update Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeHidden({ timeout: 10_000 })
    await expect.poll(() => junctionKeys(tailNoConflict), { timeout: 10_000 }).toEqual(['gpu', 'hangar'])

    // No reload: the card must carry the fresh modified_at from the post-RPC re-read.
    await openEditSheet(page, tailNoConflict)
    await page.locator('#notes').fill('second edit after services')
    await page.getByRole('button', { name: 'Update Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeHidden({ timeout: 10_000 })
    await expect(page.getByText('Someone else saved changes to this record')).toHaveCount(0)

    const row = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('notes').eq('id', ids[tailNoConflict]).single()
      return data?.notes === 'second edit after services' ? data : null
    })
    expect(row.notes).toBe('second edit after services')
    expect(await junctionKeys(tailNoConflict)).toEqual(['gpu', 'hangar'])
  })
})
