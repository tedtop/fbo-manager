import { expect, test, type Page } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

// Fixed UTC-5 browser zone (no DST) so the F1/F2 pins below are deterministic: the form's
// fabricated departure goes through toISOString() (UTC) while the typed times stay wall-clock.
test.use({ timezoneId: 'Etc/GMT+5' })

const tailNew = uniqueValue('NC2E').toUpperCase() // does not exist yet: form must create the aircraft
const tailExisting = uniqueValue('NC2E').toUpperCase() // seeded below
const tails = [tailNew, tailExisting]

test.beforeAll(async () => {
  const { error } = await db
    .from('aircraft')
    .insert({ tail_number: tailExisting, aircraft_type_icao: 'B738', aircraft_type_display: 'Boeing 737-800' })
  if (error) throw error
})

test.afterAll(async () => {
  await db.from('flight').delete().in('aircraft_id', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
})

async function openAddFlightSheet(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add Flight' }).click()
  await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()
}

async function pickAircraftType(page: Page, search: string, optionName: RegExp) {
  await page.locator('#aircraftType').click()
  await page.getByPlaceholder('Search code or model (e.g. G650, GLF6)').fill(search)
  await page.getByRole('option', { name: optionName }).first().click()
}

async function submitAndExpectClosed(page: Page) {
  // alert() (validation / swallowed failures) must not fire during a clean create.
  page.once('dialog', (d) => {
    throw new Error(`Unexpected alert: ${d.message()}`)
  })
  await page.getByRole('button', { name: 'Add Flight', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('[role="alert"]').filter({ hasText: /\S/ })).toHaveCount(0)
}

async function readFlight(tail: string) {
  return waitForDbRow(async () => {
    const { data } = await db.from('flight').select('*').eq('aircraft_id', tail).maybeSingle()
    return data
  })
}

test.describe('Add Flight sheet persists real rows', () => {
  test('arrival with a NEW tail number creates the aircraft (GLF6) and the flight', async ({ page }) => {
    await openAddFlightSheet(page)
    const date = await page.locator('#date').inputValue()

    await page.getByPlaceholder('e.g., N12345').fill(tailNew)
    await pickAircraftType(page, 'glf6', /G650/)
    await page.locator('#arrivalTime').fill('14:30')
    await page.locator('#origin').fill('KTEB')
    await page.locator('#destination').fill('KASE')
    await page.getByRole('checkbox', { name: 'Fuel' }).click()
    await page.getByRole('checkbox', { name: 'Catering' }).click()
    await submitAndExpectClosed(page)

    const aircraft = await waitForDbRow(async () => {
      const { data } = await db.from('aircraft').select('*').eq('tail_number', tailNew).maybeSingle()
      return data
    })
    expect(aircraft.aircraft_type_icao).toBe('GLF6')

    const flight = await readFlight(tailNew)
    expect(flight.origin).toBe('KTEB')
    expect(flight.destination).toBe('KASE')
    expect(flight.flight_status).toBe('scheduled')
    expect([...(flight.services ?? [])].sort()).toEqual(['catering', 'fuel'])

    // KNOWN BUG F2: flips when B09/B10 land — times are sent with no timezone offset, so Postgres
    // stores the wall-clock value as UTC regardless of the browser's zone. Once fixed, the stored
    // instant must equal the local 14:30 on the chosen date.
    expect(new Date(flight.scheduled_arrival_time as string).toISOString()).toBe(`${date}T14:30:00.000Z`)

    // KNOWN BUG F1: flips when B09/B10 land — an arrival-only entry gets a fabricated departure
    // (arrival + 45 min), so the row has both times and the board treats it as a quick turn.
    // (Also shifted by the browser's UTC-5 offset via toISOString, a facet of F2.)
    expect(new Date(flight.scheduled_departure_time as string).toISOString()).toBe(`${date}T20:15:00.000Z`)

    await expect(page.getByText(tailNew).first()).toBeVisible({ timeout: 15_000 })
    // KNOWN BUG F1: flips when B09/B10 land — shows in both columns (quick turn) instead of Arrivals only.
    await expect(page.getByText(tailNew)).toHaveCount(2)
  })

  test('flight for an existing aircraft with arrival and departure times', async ({ page }) => {
    await openAddFlightSheet(page)
    const date = await page.locator('#date').inputValue()

    await page.getByPlaceholder('e.g., N12345').fill(tailExisting)
    await pickAircraftType(page, 'b738', /B738/)
    await page.getByRole('combobox').filter({ hasText: 'Arrival' }).click() // Type select; departure time is disabled for arrivals
    await page.getByRole('option', { name: 'Quick Turn' }).click()
    await page.locator('#arrivalTime').fill('09:00')
    await page.locator('#departureTime').fill('11:20')
    await page.locator('#origin').fill('KBOS')
    await page.locator('#destination').fill('KMIA')
    await page.getByRole('checkbox', { name: 'Hangar' }).click()
    await submitAndExpectClosed(page)

    const flight = await readFlight(tailExisting)
    expect(flight.origin).toBe('KBOS')
    expect(flight.destination).toBe('KMIA')
    expect(flight.services).toEqual(['hangar'])
    // KNOWN BUG F2: flips when B09/B10 land — stored as UTC wall-clock, no offset applied.
    expect(new Date(flight.scheduled_arrival_time as string).toISOString()).toBe(`${date}T09:00:00.000Z`)
    expect(new Date(flight.scheduled_departure_time as string).toISOString()).toBe(`${date}T11:20:00.000Z`)

    const { data: aircraft } = await db.from('aircraft').select('aircraft_type_icao').eq('tail_number', tailExisting).single()
    expect(aircraft?.aircraft_type_icao).toBe('B738')

    await expect(page.getByText(tailExisting).first()).toBeVisible({ timeout: 15_000 })
  })
})
