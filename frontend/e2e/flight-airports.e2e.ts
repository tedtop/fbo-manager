import { type Page, expect, test } from '@playwright/test'
import { pickAirport } from './support/airport'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

// B50: Origin / Destination on the flight form are airport comboboxes. Stored value = ICAO (KGPI); the
// board shows the preferred code (Settings, default FAA: GPI) with the ICAO in the tooltip; a new flight
// gets the home airport on the end that is known from the times. Needs the airport seed in the local DB.
const db = createE2EDbClient()
test.use({ timezoneId: 'America/Phoenix' })

const tailGpi = uniqueValue('NC2E').toUpperCase()
const tailKeep = uniqueValue('NC2E').toUpperCase()
const tails = [tailGpi, tailKeep]

async function setSetting(key: string, value: string) {
  const { error } = await db
    .from('app_setting')
    .upsert({ key, value }, { onConflict: 'key' })
  if (error) throw error
}

test.beforeAll(async () => {
  await setSetting('home_airport', 'KMSO')
  await setSetting('airport_display', 'faa')
  const { error } = await db.from('aircraft').insert(
    tails.map((tail_number) => ({
      tail_number,
      aircraft_type_icao: 'B738',
      aircraft_type_display: 'Boeing 737-800'
    }))
  )
  if (error) throw error
})

test.afterAll(async () => {
  await db.from('flight').delete().in('tail_number', tails)
  await db.from('aircraft').delete().in('tail_number', tails)
})

async function openAddFlightSheet(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add Flight' }).click()
  await expect(
    page.getByRole('heading', { name: 'Add New Flight' })
  ).toBeVisible()
}

async function pickAircraftType(page: Page) {
  await page.locator('#aircraftType').click()
  await page
    .getByPlaceholder('Search code or model (e.g. G650, GLF6)')
    .fill('b738')
  await page.getByRole('option', { name: /B738/ }).first().click()
}

test.describe('Airport pickers on the flight form', () => {
  test('GPI lists Glacier Park and Guapi; picking Glacier stores KGPI and the card shows GPI', async ({
    page
  }) => {
    await openAddFlightSheet(page)
    await page.getByPlaceholder('e.g., N12345').fill(tailGpi)
    await pickAircraftType(page)
    await page.locator('#arrivalTime').fill('13:10')

    await page.locator('#origin').click()
    await page.getByPlaceholder(/Code or name/).fill('GPI')
    const options = page.locator('[cmdk-item]')
    await expect(options.filter({ hasText: 'Glacier Park Intl' })).toHaveCount(
      1
    )
    await expect(options.filter({ hasText: 'Guapi' })).toHaveCount(1)
    await expect(
      page.getByText('GPI matches more than one airport')
    ).toBeVisible()
    await options.filter({ hasText: 'Glacier Park Intl' }).click()
    await expect(page.locator('#origin')).toContainText('Glacier Park')

    await page
      .getByRole('button', { name: 'Add Flight', exact: true })
      .last()
      .click()
    await expect(
      page.getByRole('heading', { name: 'Add New Flight' })
    ).toBeHidden({ timeout: 10_000 })

    const flight = await waitForDbRow(async () => {
      const { data } = await db
        .from('flight')
        .select('*')
        .eq('tail_number', tailGpi)
        .maybeSingle()
      return data
    })
    expect(flight.origin).toBe('KGPI')

    // Arrival cards show the origin: the FAA code with the ICAO and name in the tooltip.
    const origin = page
      .locator('[data-testid="flight-origin"][title^="KGPI"]')
      .first()
    await expect(origin).toBeVisible({ timeout: 15_000 })
    await expect(origin).toHaveText('GPI')
    await expect(origin).toHaveAttribute('title', /Glacier Park/)
  })

  test('the home airport is prefilled on the known end, and never over something the person picked', async ({
    page
  }) => {
    await openAddFlightSheet(page)
    const origin = page.locator('#origin')
    const destination = page.locator('#destination')
    await expect(origin).toContainText('Select origin')
    await expect(destination).toContainText('Select destination')

    // Departure only (hangar pull): leaves from home.
    await page.locator('#departureTime').fill('09:00')
    await expect(origin).toContainText('Missoula')
    await expect(destination).toContainText('Select destination')

    // Add an arrival (QT is off after typing a departure): a turn has no known home end, the prefill clears.
    await page.locator('#arrivalTime').fill('08:00')
    await expect(origin).toContainText('Select origin')
    await expect(destination).toContainText('Select destination')

    // Arrival only: lands at home.
    await page.locator('#departureTime').fill('')
    await expect(destination).toContainText('Missoula')
    await expect(origin).toContainText('Select origin')

    // A picked destination is never overwritten when the times change afterwards.
    await pickAirport(page, 'destination', 'KASE')
    await page.locator('#arrivalTime').fill('')
    await page.locator('#departureTime').fill('10:00')
    await expect(destination).toContainText('Aspen')
    await expect(origin).toContainText('Missoula') // the untouched end still follows the times
  })

  test('a prefilled home airport is saved as KMSO and the departure card shows its destination label', async ({
    page
  }) => {
    await openAddFlightSheet(page)
    await page.getByPlaceholder('e.g., N12345').fill(tailKeep)
    await pickAircraftType(page)
    await page.locator('#arrivalTime').fill('14:00')
    await page.locator('#departureTime').fill('') // arrival only: destination = home
    await page
      .getByRole('button', { name: 'Add Flight', exact: true })
      .last()
      .click()
    await expect(
      page.getByRole('heading', { name: 'Add New Flight' })
    ).toBeHidden({ timeout: 10_000 })

    const flight = await waitForDbRow(async () => {
      const { data } = await db
        .from('flight')
        .select('*')
        .eq('tail_number', tailKeep)
        .maybeSingle()
      return data
    })
    expect(flight.destination).toBe('KMSO')
    expect(flight.origin ?? '').toBe('') // nothing is known about where it came from
    // An arrival's card shows no "From" line: the destination (home) is not what it came from.
    await expect(page.getByText(tailKeep).first()).toBeVisible({
      timeout: 15_000
    })
    await expect(
      page.locator('[data-testid="flight-origin"][title^="KMSO"]')
    ).toHaveCount(0)
  })
})
