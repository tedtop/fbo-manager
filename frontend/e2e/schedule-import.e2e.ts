import { expect, test, type Page } from '@playwright/test'
import { normalizeScheduleSheet } from '../lib/schedule-import/normalize'
import { zonedWallTimeToInstant } from '../lib/schedule-import/zoned-time'
import { createE2EDbClient, waitForDbRow } from './support/db'

// B45b: scan the front desk's schedule, review, import. The OCR route and the registry lookup are STUBBED (no
// Anthropic call, no adsbdb call). The fixture mirrors docs/samples/schedule-sheet-2026-11-04.jpg: six printed
// rows, one leg each (Action column), that become four flights. Dates are shifted to the coming days so the board
// ("Today + Future") shows them, and the tails are random so repeated runs do not collide.

const db = createE2EDbClient()
test.use({ timezoneId: 'America/Denver' })

const ZONE = 'America/Denver'
const rand = (n: number) => Math.floor(Math.random() * n)
const letters = () => 'ABCDEFGH'[rand(8)] + 'ABCDEFGH'[rand(8)]
const makeTail = () => `N${100 + rand(800)}${letters()}`
const T = { dep: makeTail(), turn: makeTail(), far: makeTail(), stay: makeTail() }
const tails = Object.values(T)

function denverDate(offsetDays: number): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now.getTime() + offsetDays * 86_400_000)
  )
  return parts // en-CA = YYYY-MM-DD
}
const D1 = denverDate(1)
const D3 = denverDate(3)
const D6 = denverDate(6)
const D9 = denverDate(9)
const instant = (date: string, hhmm: string) => new Date(zonedWallTimeToInstant(date, hhmm, ZONE).instantMs).toISOString()

const common = { group_date: '', confidence: 'high', needs_review: false }
const SHEET = {
  sheet_date: null,
  date_range_start: D1,
  date_range_end: D9,
  source_software_hint: 'Minuteman Aviation Inc - Scheduled Arrivals and Requests',
  rows: [
    { ...common, tail_number: T.dep, aircraft_type: 'G-IVSP', customer: 'Cash/Check Customer', departure_date: D1, departure_time: '10:00', notes: 'Service Duration - Short Stay; Confirmed 11/04/2026', raw_row_text: 'D1 | 10:00 AM | Depart | G-IVSP' },
    { ...common, tail_number: T.turn, aircraft_type: 'CJ2', customer: 'Buybacks-Contract Fuel', arrival_date: D1, arrival_time: '11:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D1 | 11:00 AM | Arrive | CJ2' },
    { ...common, tail_number: T.turn, aircraft_type: 'CJ2', customer: 'Buybacks-Contract Fuel', departure_date: D1, departure_time: '12:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D1 | 12:00 PM | Depart | CJ2' },
    { ...common, tail_number: T.far, aircraft_type: 'ENCORE', customer: 'Cash/Check Customer', departure_date: D3, departure_time: '12:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D3 | 12:00 PM | Depart | ENCORE' },
    { ...common, tail_number: T.stay, aircraft_type: 'BRAVO', customer: 'Cash/Check Customer', arrival_date: D6, arrival_time: '12:14', services: 'Rental Car - Passenger: Sadler, Fullsize Hertz - Status: Confirmed', notes: 'Service Duration - Short Stay', raw_row_text: 'D6 | 12:14 PM | Arrive | BRAVO' },
    { ...common, tail_number: T.stay, aircraft_type: 'BRAVO', customer: 'Cash/Check Customer', departure_date: D9, departure_time: '16:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D9 | 4:00 PM | Depart | BRAVO' }
  ]
}

// Registry lookup stub: three tails resolve, the fourth is unknown (the printed "BRAVO" must NOT become its type).
const REGISTRY: Record<string, { typeIcao: string; typeDescription: string }> = {
  [T.dep]: { typeIcao: 'GLF4', typeDescription: 'Gulfstream IV' },
  [T.turn]: { typeIcao: 'C25A', typeDescription: 'Citation CJ2' },
  [T.far]: { typeIcao: 'BE40', typeDescription: 'Beechjet 400' }
}

async function stubNetwork(page: Page, opts: { ocrStatus?: number } = {}) {
  await page.route('**/api/ocr/schedule-sheet', async (route) => {
    if (opts.ocrStatus && opts.ocrStatus !== 200) {
      return route.fulfill({
        status: opts.ocrStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' })
      })
    }
    // The real route returns the normalized sheet (normalizeScheduleSheet), so the stub does the same.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(normalizeScheduleSheet(SHEET)) })
  })
  await page.route('**/api/aircraft/lookup?**', async (route) => {
    const tail = new URL(route.request().url()).searchParams.get('tail') ?? ''
    await new Promise((r) => setTimeout(r, 150)) // visible spinner
    const hit = REGISTRY[tail]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: hit
          ? { tail, icao24: null, ...hit, manufacturer: null, owner: null, ownerCountry: null, photoUrl: null, photoThumbUrl: null, source: 'adsbdb' }
          : null
      })
    })
  })
}

async function upload(page: Page) {
  await page.getByTestId('schedule-file-input').setInputFiles({
    name: 'schedule.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  })
}

const card = (page: Page, tail: string) => page.locator(`[data-testid="schedule-review-card"][data-tail="${tail}"]`)

async function cleanup() {
  await db.from('flight').delete().in('tail_number', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
}

test.beforeAll(cleanup)
test.afterAll(cleanup)

test.describe('schedule sheet import', () => {
  test('six printed legs become four reviewable flights; Unpair splits a pair', async ({ page }) => {
    await stubNetwork(page)
    await page.goto('/flight-operations/import')
    await expect(page.getByRole('heading', { name: 'Import schedule' })).toBeVisible()
    await upload(page)

    await expect(page.getByTestId('schedule-review-card')).toHaveCount(4)
    await expect(page.getByTestId('sheet-info')).toContainText('4 flights from 6 printed rows')

    const turn = card(page, T.turn)
    await expect(turn.getByTestId('paired-badge')).toContainText('Paired from 2 rows')
    await expect(turn.getByText('Quick turn')).toBeVisible()
    await expect(turn.getByTestId('arrival-time')).toHaveValue('11:00')
    await expect(turn.getByTestId('departure-time')).toHaveValue('12:00')
    await expect(turn.getByTestId('type-status')).toContainText('Registry: ')
    // 60 min gap = quick turn; the 5-day stay is not
    await expect(card(page, T.stay).getByText('Quick turn')).toHaveCount(0)
    await expect(card(page, T.stay).getByTestId('type-status')).toContainText('No registry match')
    await expect(card(page, T.stay).getByTestId('service-chip')).toHaveCount(1) // rental_car

    // Undo the pairing: two single-leg cards for the same tail
    await turn.getByRole('button', { name: 'Unpair' }).click()
    await expect(page.getByTestId('schedule-review-card')).toHaveCount(5)
    await expect(card(page, T.turn)).toHaveCount(2)
    await expect(page.getByTestId('paired-badge')).toHaveCount(1) // only the 5-day stay is still paired
  })

  test('a failed extraction shows the route message and keeps the upload screen', async ({ page }) => {
    await stubNetwork(page, { ocrStatus: 502 })
    await page.goto('/flight-operations/import')
    await upload(page)
    await expect(page.getByRole('alert').filter({ hasText: /Extraction failed/ })).toContainText('Extraction failed. Check ANTHROPIC_API_KEY')
    await expect(page.getByTestId('schedule-file-input')).toBeAttached()
  })

  test('import writes four flights, the looked-up types and services; re-scanning adds nothing', async ({ page }) => {
    await stubNetwork(page)
    await page.goto('/flight-operations/import')
    await upload(page)
    await expect(page.getByTestId('schedule-review-card')).toHaveCount(4)
    await expect(page.getByTestId('import-button')).toBeEnabled({ timeout: 10_000 }) // lookups done
    await expect(page.getByTestId('import-summary')).toContainText('4 to add, 0 to update, 0 skipped')
    await page.getByTestId('import-button').click()
    await expect(page.getByTestId('import-result')).toContainText('4 added, 0 updated, 0 skipped', { timeout: 20_000 })

    const rows = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').in('tail_number', tails)
      return data && data.length === 4 ? data : null
    })
    const by = Object.fromEntries(rows.map((r) => [r.tail_number, r]))
    expect(new Date(by[T.dep].scheduled_departure_time as string).toISOString()).toBe(instant(D1, '10:00'))
    expect(by[T.dep]).toMatchObject({
      scheduled_arrival_time: null,
      contact_name: 'Cash/Check Customer',
      created_by_source: 'front-desk',
      is_quick_turn: false
    })
    expect(by[T.turn]).toMatchObject({
      is_quick_turn: true,
      contact_name: 'Buybacks-Contract Fuel',
      notes: 'Service Duration - Short Stay'
    })
    expect(new Date(by[T.turn].scheduled_arrival_time as string).toISOString()).toBe(instant(D1, '11:00'))
    expect(new Date(by[T.turn].scheduled_departure_time as string).toISOString()).toBe(instant(D1, '12:00'))
    expect(new Date(by[T.stay].scheduled_arrival_time as string).toISOString()).toBe(instant(D6, '12:14'))
    expect(new Date(by[T.stay].scheduled_departure_time as string).toISOString()).toBe(instant(D9, '16:00'))
    expect(by[T.stay].is_quick_turn).toBe(false)

    // Aircraft: type from the registry lookup, never the printed text; unknown tail -> UNKN / Unknown
    const { data: aircraft } = await db.from('aircraft').select('*').in('tail_number', tails)
    const ac = Object.fromEntries((aircraft ?? []).map((a) => [a.tail_number, a]))
    expect(ac[T.dep]).toMatchObject({ aircraft_type_icao: 'GLF4' })
    expect(ac[T.turn]).toMatchObject({ aircraft_type_icao: 'C25A' })
    expect(ac[T.stay]).toMatchObject({ aircraft_type_icao: 'UNKN', aircraft_type_display: 'Unknown' })

    // Services go through set_flight_services: the stay has the rental car
    const { data: fs } = await db.from('flight_service').select('flight_id, service:service_id(key)').eq('flight_id', by[T.stay].id)
    expect((fs ?? []).map((r) => (r.service as unknown as { key: string }).key)).toEqual(['rental_car'])

    // They show on the board
    await page.goto('/')
    await page.getByPlaceholder('Search flights...').fill(T.far)
    await expect(page.getByText(T.far).first()).toBeVisible()

    // Re-scan the same sheet: every flight is a duplicate, nothing to import, nothing created
    await page.goto('/flight-operations/import')
    await upload(page)
    await expect(page.getByTestId('schedule-review-card')).toHaveCount(4)
    await expect(page.getByTestId('duplicate-badge')).toHaveCount(4)
    await expect(page.getByTestId('import-summary')).toContainText('0 to add, 0 to update, 4 skipped')
    await expect(page.getByTestId('import-button')).toBeDisabled()
    const { count } = await db.from('flight').select('id', { count: 'exact', head: true }).in('tail_number', tails)
    expect(count).toBe(4)
  })
})

test.describe('mobile layout (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('board shows the icon button; the review is stacked cards with no sideways scroll', async ({ page }) => {
    await stubNetwork(page)
    await page.goto('/')
    const link = page.getByRole('link', { name: 'Import schedule' })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/flight-operations\/import$/)

    await upload(page)
    await expect(page.getByTestId('schedule-review-card')).toHaveCount(4)
    await expect(page.getByTestId('import-button')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const widths = await page.getByTestId('schedule-review-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
    for (const w of widths) expect(w).toBeLessThanOrEqual(390)
    const tops = await page.getByTestId('schedule-review-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
    expect([...tops].sort((a, b) => a - b)).toEqual(tops) // one column
  })
})
