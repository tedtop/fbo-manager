import { expect, test, type Locator, type Page } from '@playwright/test'
import { createE2EDbClient } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

// B42: a flight shown in both columns (quick turn, or a stay with both times) is ONE record, so hovering
// either card highlights both. Flights shown once (arrival-only, departure-only) are never linked.
const tailTurn = uniqueValue('NLH').toUpperCase() // quick turn: both columns
const tailStay = uniqueValue('NLH').toUpperCase() // stay with both times, not QT: both columns
const tailArr = uniqueValue('NLH').toUpperCase() // arrival only
const tailDep = uniqueValue('NLH').toUpperCase() // departure only
const tails = [tailTurn, tailStay, tailArr, tailDep]
let userId: number

test.beforeAll(async () => {
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-linked-hover-'),
      password: 'test-password-hash',
      first_name: 'E2E',
      last_name: 'Hover',
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
  const d = new Date()
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = (offsetMin: number) =>
    new Date(Math.min(startOfToday + 24 * 3600_000 - 5 * 60_000, Math.max(startOfToday + 5 * 60_000, now + offsetMin * 60_000))).toISOString()
  const base = { created_by_id: userId, origin: 'KAAA', destination: 'KBBB', is_quick_turn: false, flight_status: 'scheduled' as const }
  const { error: flightError } = await db.from('flight').insert([
    { ...base, tail_number: tailTurn, scheduled_arrival_time: today(60), scheduled_departure_time: today(120), is_quick_turn: true },
    { ...base, tail_number: tailStay, scheduled_arrival_time: today(30), scheduled_departure_time: today(400) },
    { ...base, tail_number: tailArr, scheduled_arrival_time: today(90) },
    { ...base, tail_number: tailDep, scheduled_departure_time: today(240) },
  ])
  if (flightError) throw flightError
})

test.afterAll(async () => {
  await db.from('flight').delete().in('tail_number', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
  await db.from('users').delete().eq('id', userId)
})

// A column's card for a tail: the column is the nearest section above the Arrivals/Departures heading.
const column = (page: Page, heading: 'Arrivals' | 'Departures'): Locator =>
  page.getByRole('heading', { name: heading, exact: true }).locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]')
const cardIn = (page: Page, heading: 'Arrivals' | 'Departures', tail: string): Locator =>
  column(page, heading).locator('[data-slot="card"]').filter({ hasText: tail })
const bothCards = (page: Page, tail: string): Locator => page.locator('[data-slot="card"]').filter({ hasText: tail })

// The ring colour class of a card (e.g. ring-sky-500), or null when it has none.
const ringColor = async (card: Locator) => ((await card.getAttribute('class')) ?? '').match(/(?:^|\s)(ring-[a-z]+-500)(?:\s|$)/)?.[1] ?? null

// The hover highlight is the ring; the link colour is the left border.
const RING = /(^|\s)ring-2(\s|$)/
const LINK_BORDER = /(^|\s)border-l-4(\s|$)/

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(tailTurn).first()).toBeVisible({ timeout: 15_000 })
})

for (const [label, getTail] of [
  ['quick turn', () => tailTurn],
  ['stay with both times', () => tailStay],
] as const) {
  test(`${label}: hovering either card highlights both, and moving away clears it`, async ({ page }) => {
    const tail = getTail()
    const arrival = cardIn(page, 'Arrivals', tail)
    const departure = cardIn(page, 'Departures', tail)
    await expect(bothCards(page, tail)).toHaveCount(2)
    await expect(arrival).toHaveClass(LINK_BORDER)
    await expect(departure).toHaveClass(LINK_BORDER)

    await arrival.hover()
    await expect(arrival).toHaveClass(RING)
    await expect(departure).toHaveClass(RING)
    // Both cards draw the same link-coloured ring, not the neutral one an unlinked card gets.
    expect(await ringColor(arrival)).not.toBeNull()
    expect(await ringColor(departure)).toBe(await ringColor(arrival))

    await departure.hover()
    await expect(arrival).toHaveClass(RING)
    await expect(departure).toHaveClass(RING)

    await page.mouse.move(0, 0)
    await expect(arrival).not.toHaveClass(RING)
    await expect(departure).not.toHaveClass(RING)
  })
}

test('hovering one linked flight does not highlight another flight', async ({ page }) => {
  await cardIn(page, 'Arrivals', tailTurn).hover()
  await expect(cardIn(page, 'Departures', tailTurn)).toHaveClass(RING)
  await expect(bothCards(page, tailStay).first()).not.toHaveClass(RING)
  await expect(bothCards(page, tailStay).last()).not.toHaveClass(RING)
})

test('a flight shown once is not linked and highlights only itself', async ({ page }) => {
  await expect(bothCards(page, tailArr)).toHaveCount(1)
  await expect(bothCards(page, tailDep)).toHaveCount(1)
  await expect(bothCards(page, tailArr)).not.toHaveClass(LINK_BORDER)
  await expect(bothCards(page, tailDep)).not.toHaveClass(LINK_BORDER)

  await bothCards(page, tailDep).hover()
  await expect(bothCards(page, tailDep)).toHaveClass(RING)
  await expect(bothCards(page, tailTurn).first()).not.toHaveClass(RING)
  await expect(bothCards(page, tailTurn).last()).not.toHaveClass(RING)
})
