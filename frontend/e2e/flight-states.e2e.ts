import { expect, test, type Page, type Route } from '@playwright/test'
import { createE2EDbClient } from './support/db'
import { uniqueValue } from './support/unique'

// B18 (F11): loading / empty / error states of the flight board.
//   - empty day: plain "No ... today" copy, no Clear filters action
//   - filters that match nothing: the message names the filters and Clear filters works
//   - a failed flight fetch: error state with Retry that recovers
//   - a week change keeps the previous flights on screen (no skeleton flash)

const db = createE2EDbClient()

const tailArr = uniqueValue('NST').toUpperCase() // arrival only, today
const tailDep = uniqueValue('NST').toUpperCase() // departure only, today
const tails = [tailArr, tailDep]
let userId: number

test.beforeAll(async () => {
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-flight-states-'),
      password: 'test-password-hash',
      first_name: 'E2E',
      last_name: 'States',
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

  // Clamp into today's local day (00:05..23:55) so the seeds never spill into tomorrow late in the evening.
  const now = Date.now()
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
  const today = (offsetMin: number) =>
    new Date(Math.min(startOfToday + 24 * 3600_000 - 5 * 60_000, Math.max(startOfToday + 5 * 60_000, now + offsetMin * 60_000))).toISOString()
  const base = { created_by_id: userId, origin: 'KAAA', destination: 'KBBB', is_quick_turn: false, flight_status: 'scheduled' as const }
  const { error: flightError } = await db.from('flight').insert([
    { ...base, aircraft_id: tailArr, scheduled_arrival_time: today(60) },
    { ...base, aircraft_id: tailDep, scheduled_departure_time: today(120) },
  ])
  if (flightError) throw flightError
})

test.afterAll(async () => {
  await db.from('flight').delete().in('aircraft_id', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
  await db.from('users').delete().eq('id', userId)
})

const flightFetch = /\/rest\/v1\/flight\?/
const searchBox = (page: Page) => page.getByPlaceholder('Search flights...')

async function openBoard(page: Page) {
  await page.goto('/')
  await expect(page.getByText(tailArr).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(tailDep).first()).toBeVisible()
}

test.describe('Flight board states', () => {
  test('an empty day shows the empty state without a Clear filters action', async ({ page }) => {
    // Answer the board's flight fetch with no rows, whatever else is in the shared local DB.
    await page.route(flightFetch, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch() // keeps the real CORS headers
      await route.fulfill({ response, json: [] })
    })
    await page.goto('/')

    await expect(page.getByText('No flights today')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('No arrivals', { exact: true })).toBeVisible()
    await expect(page.getByText('No departures', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Arrivals' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Departures' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0)
  })

  test('a filter with no matches explains itself, and Clear filters restores the board', async ({ page }) => {
    await openBoard(page)

    // One column empty, the other not: that column explains the filter; the other still lists the match.
    await searchBox(page).fill(tailDep)
    await expect(page.getByText(`No arrivals match: search '${tailDep}'`)).toBeVisible()
    await expect(page.locator('[data-slot="card"]').filter({ hasText: tailDep })).toHaveCount(1)
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(searchBox(page)).toHaveValue('')
    await expect(page.getByText(tailArr).first()).toBeVisible()
    await expect(page.getByText(tailDep).first()).toBeVisible()

    // Both columns empty: one overall message and one Clear filters action.
    const nothing = uniqueValue('ZZNOMATCH')
    await searchBox(page).fill(nothing)
    await expect(page.getByText(`No flights match: search '${nothing}'`)).toBeVisible()
    await expect(page.getByText(tailArr)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(1)

    // Single-column view explains it for that column.
    await page.getByRole('button', { name: 'Arrivals Only' }).click()
    await expect(page.getByText(`No arrivals match: search '${nothing}'`)).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(searchBox(page)).toHaveValue('')
    await expect(page.getByText(tailArr).first()).toBeVisible()
    await expect(page.getByText(/No \w+ match/)).toHaveCount(0)
  })

  test('a failed fetch shows the error state with a Retry that recovers', async ({ page }) => {
    // Fail the board's flight fetch with an HTTP error. (A network abort works too but takes ~35 s to
    // surface: postgrest-js retries network errors with backoff inside each react-query retry.)
    const failing = async (route: Route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch() // keeps the real CORS headers
      await route.fulfill({ response, status: 400, json: { message: 'Forced flight fetch failure' } })
    }
    await page.route(flightFetch, failing)
    await page.goto('/')

    // react-query retries 3 times (1s, 2s, 4s backoff) before the error surfaces.
    const alert = page.getByRole('alert').filter({ hasText: "Couldn't load flights" })
    await expect(alert).toBeVisible({ timeout: 20_000 })
    await expect(alert).toContainText('Forced flight fetch failure')
    await expect(page.getByText(tailArr)).toHaveCount(0)
    // The toolbar stays usable.
    await expect(searchBox(page)).toBeVisible()

    await page.unroute(flightFetch, failing)
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText(tailArr).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('alert').filter({ hasText: "Couldn't load flights" })).toHaveCount(0)
  })

  test('changing the window keeps the previous flights on screen while it refetches', async ({ page }) => {
    await openBoard(page)
    await page.getByRole('button', { name: 'Calendar View' }).click()
    await expect(page.getByRole('button', { name: 'Prev' })).toBeVisible({ timeout: 15_000 })

    // Next week is a new query key; hold its response back.
    await page.route(flightFetch, async (route) => {
      if (route.request().method() === 'GET') await new Promise((resolve) => setTimeout(resolve, 2_000))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // While the slow fetch is pending the inline indicator shows, but the calendar stays: no skeleton.
    await expect(page.getByRole('status', { name: 'Refreshing flights' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading calendar' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Prev' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Refreshing flights' })).toBeHidden({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Prev' })).toBeVisible()
  })
})
