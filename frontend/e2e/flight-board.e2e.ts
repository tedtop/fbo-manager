import { expect, test, type Page } from '@playwright/test'
import { createE2EDbClient } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

// Three flights seeded straight into the DB (service role), tracked so afterAll only removes our own rows.
// Classification (D2/D6): a flight is in Arrivals if it has a scheduled arrival and in Departures if it has a
// scheduled departure, so a flight with both times lands in both columns, arrival-only or departure-only in one.
const tailTurn = uniqueValue('NE2E').toUpperCase() // arrival + departure, scheduled
const tailDep = uniqueValue('NE2E').toUpperCase() // departure only, scheduled
const tailDelayed = uniqueValue('NE2E').toUpperCase() // departure only, delayed
const tailArr = uniqueValue('NE2E').toUpperCase() // arrival only (return), scheduled
const tails = [tailTurn, tailDep, tailDelayed, tailArr]
let userId: number

test.beforeAll(async () => {
  // created_by_id is NOT NULL on the local schema (F8) and references the legacy `users` table.
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-flight-user-'),
      password: 'test-password-hash',
      first_name: 'E2E',
      last_name: 'Board',
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

  const now = Date.now()
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString()
  // is_quick_turn is set explicitly: a bulk insert sends null for keys missing from some rows.
  const base = { created_by_id: userId, origin: 'KAAA', destination: 'KBBB', is_quick_turn: false }
  const { error: flightError } = await db.from('flight').insert([
    { ...base, aircraft_id: tailTurn, scheduled_arrival_time: iso(60), scheduled_departure_time: iso(120), is_quick_turn: true, flight_status: 'scheduled' },
    { ...base, aircraft_id: tailArr, scheduled_arrival_time: iso(90), flight_status: 'scheduled' },
    { ...base, aircraft_id: tailDep, scheduled_departure_time: iso(240), flight_status: 'scheduled' },
    { ...base, aircraft_id: tailDelayed, scheduled_departure_time: iso(300), flight_status: 'delayed' },
  ])
  if (flightError) throw flightError
})

test.afterAll(async () => {
  await db.from('flight').delete().in('aircraft_id', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
  await db.from('users').delete().eq('id', userId)
})

async function openBoard(page: Page) {
  await page.goto('/')
  await expect(page.getByText(tailTurn).first()).toBeVisible({ timeout: 15_000 })
}

const arrivalsHeading = (page: Page) => page.getByRole('heading', { name: 'Arrivals' })
const departuresHeading = (page: Page) => page.getByRole('heading', { name: 'Departures' })

test.describe('Flight board', () => {
  test('seeded flights show on the split board', async ({ page }) => {
    await openBoard(page)
    await expect(arrivalsHeading(page)).toBeVisible()
    await expect(departuresHeading(page)).toBeVisible()
    for (const tail of tails) await expect(page.getByText(tail).first()).toBeVisible()

    // Departure-only flights appear once (departures column only).
    await expect(page.getByText(tailDep)).toHaveCount(1)
    await expect(page.getByText(tailDelayed)).toHaveCount(1)

    // Arrival-only flights appear once (arrivals column only).
    await expect(page.getByText(tailArr)).toHaveCount(1)
    // A quick turn lands in BOTH columns, and shows its QT badge on both cards.
    await expect(page.getByText(tailTurn)).toHaveCount(2)
    await expect(page.getByText('QT', { exact: true })).toHaveCount(2)
  })

  test('arrivals / departures / split toggle switches the layout', async ({ page }) => {
    await openBoard(page)

    await page.getByRole('button', { name: 'Departures Only' }).click()
    await expect(arrivalsHeading(page)).toHaveCount(0)
    await expect(departuresHeading(page)).toBeVisible()
    await expect(page.getByText(tailDep)).toHaveCount(1)
    await expect(page.getByText(tailTurn)).toHaveCount(1)
    await expect(page.getByText(tailArr)).toHaveCount(0) // arrival-only flight is not a departure

    await page.getByRole('button', { name: 'Arrivals Only' }).click()
    await expect(departuresHeading(page)).toHaveCount(0)
    await expect(arrivalsHeading(page)).toBeVisible()
    await expect(page.getByText(tailDep)).toHaveCount(0) // departure-only flight is not an arrival
    await expect(page.getByText(tailTurn)).toHaveCount(1) // the quick turn is in Arrivals too
    await expect(page.getByText(tailArr)).toHaveCount(1)

    await page.getByRole('button', { name: 'Split View' }).click()
    await expect(arrivalsHeading(page)).toBeVisible()
    await expect(departuresHeading(page)).toBeVisible()
    await expect(page.getByText(tailDep)).toHaveCount(1)
  })

  test('search by tail number filters the board', async ({ page }) => {
    await openBoard(page)
    await page.getByPlaceholder('Search flights...').fill(tailDep)
    await expect(page.getByText(tailDep)).toHaveCount(1)
    await expect(page.getByText(tailTurn)).toHaveCount(0)
    await expect(page.getByText(tailDelayed)).toHaveCount(0)

    await page.getByPlaceholder('Search flights...').fill('')
    await expect(page.getByText(tailTurn).first()).toBeVisible()
  })

  test('status filter narrows the board', async ({ page }) => {
    await openBoard(page)
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('combobox').first().click() // Status select (first in the popover)
    await page.getByRole('option', { name: 'Delayed' }).click()
    await page.keyboard.press('Escape') // close the popover

    await expect(page.getByText(tailDelayed)).toHaveCount(1)
    await expect(page.getByText(tailDep)).toHaveCount(0)
    await expect(page.getByText(tailTurn)).toHaveCount(0)
  })

  test('date range filter does nothing yet', async ({ page }) => {
    await openBoard(page)
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('combobox').nth(1).click() // Date Range select
    await page.getByRole('option', { name: 'Tomorrow' }).click()
    await page.keyboard.press('Escape')

    // KNOWN BUG F4: flips when B09/B13 land — dateRange is never applied, so "Tomorrow" still shows
    // flights seeded for today. Once fixed, these should be hidden.
    for (const tail of tails) await expect(page.getByText(tail).first()).toBeVisible()
  })
})
