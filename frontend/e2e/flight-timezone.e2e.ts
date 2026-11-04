import { expect, test, type Locator, type Page } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { pickAirport } from './support/airport'
import { uniqueValue } from './support/unique'

// B10 (F2/F5): flight times are real instants. Browser zone is pinned to America/Phoenix (UTC-7, no DST)
// so the expected UTC instants are fixed: local 23:30 is 06:30Z the next UTC day.
test.use({ timezoneId: 'America/Phoenix' })

const db = createE2EDbClient()

const tailCreate = uniqueValue('NTZ').toUpperCase() // created through the sheet at 23:30
const tailEdit = uniqueValue('NTZ').toUpperCase() // seeded 23:30 -> 00:30, edited without touching times
const tailFar = uniqueValue('NTZ').toUpperCase() // seeded 6 weeks ahead
const tails = [tailCreate, tailEdit, tailFar]
let userId: number

const phoenixInstant = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-07:00`).toISOString()
// "YYYY-MM-DD" + n calendar days (no timezone involved).
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
// The flight card's "MM/DD HH:mm" label.
const cardLabel = (date: string, hhmm: string) => `${date.slice(5, 7)}/${date.slice(8, 10)} ${hhmm}`

test.beforeAll(async () => {
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-flight-tz-user-'),
      password: 'test-password-hash',
      first_name: 'E2E',
      last_name: 'Timezone',
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
})

test.afterAll(async () => {
  await db.from('flight').delete().in('tail_number', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
  await db.from('users').delete().eq('id', userId)
})

const cards = (page: Page, tail: string): Locator => page.locator('[data-slot="card"]').filter({ hasText: tail })

async function pickAircraftType(page: Page, search: string, optionName: RegExp) {
  await page.locator('#aircraftType').click()
  await page.getByPlaceholder('Search code or model (e.g. G650, GLF6)').fill(search)
  await page.getByRole('option', { name: optionName }).first().click()
}

test.describe('Timezone handling (B10)', () => {
  test('a flight created at 23:30 local keeps its date and time after reload, and edit does not shift it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()
    const date = await page.locator('#date').inputValue()
    const nextDate = addDays(date, 1)

    await page.getByPlaceholder('e.g., N12345').fill(tailCreate)
    await pickAircraftType(page, 'b738', /B738/)
    await page.locator('#arrivalTime').fill('23:30')
    await expect(page.locator('#departureTime')).toHaveValue('00:30') // QT rolls past midnight
    await page.getByRole('button', { name: 'Add Flight', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeHidden({ timeout: 10_000 })

    // DB holds the true instants: local 23:30 on `date`, local 00:30 on the following local date.
    const created = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').eq('tail_number', tailCreate).maybeSingle()
      return data
    })
    const expectedArrival = phoenixInstant(date, '23:30')
    const expectedDeparture = phoenixInstant(nextDate, '00:30')
    expect(new Date(created.scheduled_arrival_time as string).toISOString()).toBe(expectedArrival)
    expect(new Date(created.scheduled_departure_time as string).toISOString()).toBe(expectedDeparture)
    // 23:30 Phoenix is already the next day in UTC: the old bug would have stored `date` 23:30Z.
    expect(expectedArrival.slice(0, 10)).toBe(nextDate)

    // After a reload it still shows 23:30 on the same local date (and 00:30 the next day).
    await page.reload()
    await expect(cards(page, tailCreate).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(cardLabel(date, '23:30'))).toBeVisible()
    await expect(page.getByText(cardLabel(nextDate, '00:30'))).toBeVisible()

    // Edit: the form splits the instant back into the local date and times...
    await cards(page, tailCreate).first().getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeVisible()
    await expect(page.locator('#date')).toHaveValue(date)
    await expect(page.locator('#arrivalTime')).toHaveValue('23:30')
    await expect(page.locator('#departureTime')).toHaveValue('00:30')

    // ...and saving without touching the times leaves the stored instants unchanged.
    await pickAirport(page, 'origin', 'KTEB')
    await page.getByRole('button', { name: 'Update Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeHidden({ timeout: 10_000 })
    const after = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').eq('tail_number', tailCreate).single()
      return data?.origin === 'KTEB' ? data : null
    })
    expect(new Date(after.scheduled_arrival_time as string).toISOString()).toBe(expectedArrival)
    expect(new Date(after.scheduled_departure_time as string).toISOString()).toBe(expectedDeparture)
  })

  test('editing a seeded 23:30 -> 00:30 flight round-trips and a changed departure lands on the right instant', async ({ page }) => {
    const date = '2027-01-10'
    const { error } = await db.from('flight').insert({
      tail_number: tailEdit,
      created_by_id: userId,
      origin: 'KAAA',
      destination: 'KBBB',
      scheduled_arrival_time: phoenixInstant(date, '23:30'),
      scheduled_departure_time: phoenixInstant(addDays(date, 1), '00:30'),
      is_quick_turn: true,
      flight_status: 'scheduled',
    })
    if (error) throw error

    await page.goto('/')
    // The seeded flight is on a fixed future date: the default "Today" filter (B13) hides it.
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('combobox').nth(1).click() // Date Range select
    await page.getByRole('option', { name: 'All Dates' }).click()
    await page.keyboard.press('Escape')
    await expect(cards(page, tailEdit).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(cardLabel(date, '23:30'))).toBeVisible()
    await cards(page, tailEdit).first().getByRole('button', { name: 'Edit' }).click()
    await expect(page.locator('#date')).toHaveValue(date)
    await expect(page.locator('#arrivalTime')).toHaveValue('23:30')
    await expect(page.locator('#departureTime')).toHaveValue('00:30')

    // Move the departure to 01:15 (still after midnight): it must stay on the next local day.
    await page.locator('#departureTime').fill('01:15')
    await page.getByRole('button', { name: 'Update Flight' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Flight' })).toBeHidden({ timeout: 10_000 })
    const after = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').eq('tail_number', tailEdit).single()
      return new Date(data?.scheduled_departure_time as string).toISOString() === phoenixInstant(addDays(date, 1), '01:15')
        ? data
        : null
    })
    expect(new Date(after.scheduled_arrival_time as string).toISOString()).toBe(phoenixInstant(date, '23:30'))
  })

  test('calendar navigation loads the visible week, even more than 4 weeks ahead', async ({ page }) => {
    // Exactly six weeks from now (minute-aligned): same weekday, week offset +6. Phoenix has no DST.
    const inSixWeeks = new Date(Math.floor((Date.now() + 42 * 24 * 3_600_000) / 60_000) * 60_000).toISOString()
    const { error } = await db.from('flight').insert({
      tail_number: tailFar,
      created_by_id: userId,
      origin: 'KAAA',
      destination: 'KBBB',
      scheduled_departure_time: inSixWeeks,
      flight_status: 'scheduled',
    })
    if (error) throw error

    await page.goto('/')
    await page.getByRole('button', { name: 'Calendar View' }).click()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible()
    await expect(page.getByText(tailFar)).toHaveCount(0)

    // Each navigation refetches that week; the calendar remounts once the load finishes.
    for (let week = 1; week <= 6; week++) {
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible({ timeout: 15_000 })
      if (week < 6) await expect(page.getByText(tailFar)).toHaveCount(0)
    }
    await expect(page.getByText(tailFar).first()).toBeVisible({ timeout: 15_000 })
  })
})
