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
const tailTomorrow = uniqueValue('NE2E').toUpperCase() // departure tomorrow (local day)
const tailMonth = uniqueValue('NE2E').toUpperCase() // departure 30 days out (outside the default fetch window)
const tailStay = uniqueValue('NE2E').toUpperCase() // B43: arrived 10 days ago, leaves in 2 days (on the ramp today and tomorrow)
// B43b: hide / Show hidden / Departed (own tail prefix, so no tail is a substring of another). tailHidden was hidden by hand an hour ago; tailDepartedOld is an arrival-only
// flight set to Departed days ago (its hidden_at has passed); tailDepartedToday departed today (hidden_at is the
// start of tomorrow, so it is still on today's board); tailHideMe and tailDepartMe are flights the specs act on.
const tailHidden = uniqueValue('NHID').toUpperCase()
const tailDepartedOld = uniqueValue('NHID').toUpperCase()
const tailDepartedToday = uniqueValue('NHID').toUpperCase()
const tailHideMe = uniqueValue('NHID').toUpperCase()
const tailDepartMe = uniqueValue('NHID').toUpperCase()
const tailStaleHide = uniqueValue('NHID').toUpperCase()
const tails = [
  tailTurn, tailDep, tailDelayed, tailArr, tailTomorrow, tailMonth, tailStay,
  tailHidden, tailDepartedOld, tailDepartedToday, tailHideMe, tailDepartMe, tailStaleHide,
]
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
  // Local calendar day offset at 12:00 local (DST-safe, and never near a midnight edge).
  const noonInDays = (days: number) => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12).toISOString()
  }
  // Today's flights are seeded at now+1h..+5h, so near the end of the local day they would spill into
  // tomorrow. Clamp them to 00:05..23:55 of today to keep the date assertions deterministic.
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
  const today = (offsetMin: number) =>
    new Date(Math.min(startOfToday + 24 * 3600_000 - 5 * 60_000, Math.max(startOfToday + 5 * 60_000, now + offsetMin * 60_000))).toISOString()
  const startOfTomorrow = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1).toISOString()
  // is_quick_turn is set explicitly: a bulk insert sends null for keys missing from some rows.
  const base = { created_by_id: userId, origin: 'KAAA', destination: 'KBBB', is_quick_turn: false }
  const { error: flightError } = await db.from('flight').insert([
    { ...base, tail_number: tailTurn, scheduled_arrival_time: today(60), scheduled_departure_time: today(120), is_quick_turn: true, flight_status: 'scheduled' },
    { ...base, tail_number: tailArr, scheduled_arrival_time: today(90), flight_status: 'scheduled' },
    { ...base, tail_number: tailDep, scheduled_departure_time: today(240), flight_status: 'scheduled' },
    { ...base, tail_number: tailDelayed, scheduled_departure_time: today(300), flight_status: 'delayed' },
    { ...base, tail_number: tailTomorrow, scheduled_departure_time: noonInDays(1), flight_status: 'scheduled' },
    { ...base, tail_number: tailMonth, scheduled_departure_time: noonInDays(30), flight_status: 'scheduled' },
    { ...base, tail_number: tailStay, scheduled_arrival_time: noonInDays(-10), scheduled_departure_time: noonInDays(2), flight_status: 'scheduled' },
    { ...base, tail_number: tailHidden, scheduled_departure_time: today(180), flight_status: 'scheduled', hidden_at: iso(-60) },
    { ...base, tail_number: tailDepartedOld, scheduled_arrival_time: noonInDays(-3), flight_status: 'departed', hidden_at: new Date(startOfToday).toISOString() },
    { ...base, tail_number: tailDepartedToday, scheduled_departure_time: today(200), flight_status: 'departed', hidden_at: startOfTomorrow },
    { ...base, tail_number: tailHideMe, scheduled_departure_time: today(210), flight_status: 'scheduled' },
    { ...base, tail_number: tailDepartMe, scheduled_departure_time: today(220), flight_status: 'scheduled' },
    { ...base, tail_number: tailStaleHide, scheduled_departure_time: today(230), flight_status: 'scheduled' },
  ])
  if (flightError) throw flightError
})

test.afterAll(async () => {
  await db.from('flight').delete().in('tail_number', tails)
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
    for (const tail of [tailTurn, tailDep, tailDelayed, tailArr]) await expect(page.getByText(tail).first()).toBeVisible()

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
    // Count cards, not text: the emptied Arrivals column names the search term too (B18).
    await expect(page.locator('[data-slot="card"]').filter({ hasText: tailDep })).toHaveCount(1)
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

  // B13 / F4: the toolbar date range filters by LOCAL day, and the list fetch is bounded (-1..+14 days)
  // until "All Dates" opts in to the unbounded fetch.
  async function pickDateRange(page: Page, option: string) {
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('combobox').nth(1).click() // Date Range select
    await page.getByRole('option', { name: option, exact: true }).click()
    await page.keyboard.press('Escape')
  }

  // B43b / D13: the default is Today + Future: every flight whose stay ends today or later, with no upper
  // bound (so a flight 30 days out is on the board), minus hidden flights.
  test('default view is Today + Future: today, tomorrow and 30-days-out flights are shown', async ({ page }) => {
    await openBoard(page)
    for (const tail of [tailTurn, tailDep, tailDelayed, tailArr, tailStay, tailTomorrow, tailMonth]) {
      await expect(page.getByText(tail).first()).toBeVisible()
    }
    await page.getByRole('button', { name: 'Filters' }).click()
    await expect(page.getByRole('combobox').nth(1)).toHaveText('Today + Future')
  })

  // B43: aircraft on the ramp show on every day of their stay. The arrival-only (return) flight has no
  // departure, so it stays listed from its arrival day onward; the stay arrived before the fetch window.
  test('Tomorrow shows tomorrow\'s flights and the aircraft still on the ramp', async ({ page }) => {
    await openBoard(page)
    await pickDateRange(page, 'Tomorrow')
    await expect(page.getByText(tailTomorrow).first()).toBeVisible()
    await expect(page.getByText(tailStay).first()).toBeVisible()
    await expect(page.getByText(tailArr).first()).toBeVisible()
    for (const tail of [tailTurn, tailDep, tailDelayed, tailMonth]) await expect(page.getByText(tail)).toHaveCount(0)
  })

  test('Today shows only today\'s flights', async ({ page }) => {
    await openBoard(page)
    await pickDateRange(page, 'Today')
    for (const tail of [tailTurn, tailDep, tailDelayed, tailArr, tailStay]) await expect(page.getByText(tail).first()).toBeVisible()
    await expect(page.getByText(tailTomorrow)).toHaveCount(0)
    await expect(page.getByText(tailMonth)).toHaveCount(0)
  })

  test('All Dates opts in to the unbounded fetch and includes a flight 30 days out', async ({ page }) => {
    await openBoard(page)
    await pickDateRange(page, 'Today') // bounded by the day (and the -1..+14 day fetch window)
    await expect(page.getByText(tailMonth)).toHaveCount(0)
    await pickDateRange(page, 'All Dates')
    await expect(page.getByText(tailMonth).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(tailTomorrow).first()).toBeVisible()
    await expect(page.getByText(tailTurn).first()).toBeVisible()
  })

  // B43b: Hide / Show hidden / Departed.
  const card = (page: Page, tail: string) => page.locator('[data-slot="card"]').filter({ hasText: tail })
  const hiddenAt = async (tail: string) => {
    const { data, error } = await db.from('flight').select('hidden_at').eq('tail_number', tail).single()
    if (error) throw error
    return data.hidden_at as string | null
  }
  async function setShowHidden(page: Page, on: boolean) {
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('switch', { name: 'Show hidden' }).setChecked(on)
    await page.keyboard.press('Escape')
  }

  test('hidden flights are off the default board; a flight departed today is still on it', async ({ page }) => {
    await openBoard(page)
    await expect(card(page, tailDepartedToday)).toHaveCount(1)
    await expect(page.getByText(tailHidden)).toHaveCount(0)
    await expect(page.getByText(tailDepartedOld)).toHaveCount(0)
  })

  test('Show hidden lists hidden flights, marked Hidden with an Unhide button', async ({ page }) => {
    await openBoard(page)
    await setShowHidden(page, true)
    for (const tail of [tailHidden, tailDepartedOld]) {
      await expect(card(page, tail)).toHaveCount(1)
      await expect(card(page, tail).getByText('Hidden', { exact: true })).toBeVisible()
      await expect(card(page, tail).getByRole('button', { name: 'Unhide' })).toBeVisible()
      await expect(card(page, tail).getByRole('button', { name: 'Hide', exact: true })).toHaveCount(0)
    }
    // An ordinary card in the same list is not marked.
    await expect(card(page, tailDep).getByText('Hidden', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Filters/ })).toContainText('1') // counted as an active filter

    await setShowHidden(page, false)
    await expect(page.getByText(tailHidden)).toHaveCount(0)
    await expect(card(page, tailDep)).toHaveCount(1)
  })

  test('Hide sits right of Edit, hides the flight, and Unhide brings it back', async ({ page }) => {
    await openBoard(page)
    const hideMe = card(page, tailHideMe)
    await expect(hideMe).toHaveCount(1)
    await expect(hideMe.getByRole('button', { name: 'Edit' }).locator('xpath=following-sibling::button[1]')).toHaveText('Hide')

    await hideMe.getByRole('button', { name: 'Hide', exact: true }).click()
    await expect(hideMe).toHaveCount(0)
    await expect.poll(() => hiddenAt(tailHideMe)).not.toBeNull()

    await setShowHidden(page, true)
    await expect(hideMe).toHaveCount(1)
    await expect(hideMe.getByText('Hidden', { exact: true })).toBeVisible()
    await hideMe.getByRole('button', { name: 'Unhide' }).click()
    await expect.poll(() => hiddenAt(tailHideMe)).toBeNull()
    await expect(hideMe.getByText('Hidden', { exact: true })).toHaveCount(0)
    await expect(hideMe.getByRole('button', { name: 'Hide', exact: true })).toBeVisible()
  })

  test('stale Hide: a flight changed behind the card is refused with a toast and stays visible', async ({ page }) => {
    await openBoard(page)
    // Keep the card stale: refetches (realtime, polling) must not refresh it before the click.
    await page.route(/\/rest\/v1\/flight(\?|$)/, (route) =>
      route.request().method() === 'GET' ? route.abort() : route.continue()
    )
    const { error } = await db.from('flight').update({ notes: 'changed behind the card' }).eq('tail_number', tailStaleHide)
    if (error) throw error

    await card(page, tailStaleHide).getByRole('button', { name: 'Hide', exact: true }).click()
    await expect(page.getByText('Flight was changed by someone else').first()).toBeVisible({ timeout: 10_000 })
    expect(await hiddenAt(tailStaleHide)).toBeNull()
  })

  test('setting a flight to Departed keeps it on today\'s board and hides it from tomorrow (hidden_at = start of tomorrow)', async ({ page }) => {
    await openBoard(page)
    const departMe = card(page, tailDepartMe)
    await departMe.getByText('Scheduled', { exact: true }).click()
    await page.getByRole('menuitem', { name: 'Departed' }).click()

    const startOfTomorrow = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1).getTime()
    await expect.poll(async () => {
      const at = await hiddenAt(tailDepartMe)
      return at ? new Date(at).getTime() : null
    }).toBe(startOfTomorrow)
    await expect(departMe).toHaveCount(1) // still on today's board
    await expect(departMe.getByText('Hidden', { exact: true })).toHaveCount(0)
  })
})
