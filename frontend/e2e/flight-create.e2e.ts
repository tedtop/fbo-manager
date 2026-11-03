import { expect, test, type Page } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

// Fixed UTC-5 browser zone (no DST) so the F2 pins below are deterministic: the form sends naive
// wall-clock timestamps, which Postgres stores as UTC regardless of the browser zone.
test.use({ timezoneId: 'Etc/GMT+5' })

const tailNew = uniqueValue('NC2E').toUpperCase() // does not exist yet: form must create the aircraft
const tailExisting = uniqueValue('NC2E').toUpperCase() // seeded below
const tailDepOnly = uniqueValue('NC2E').toUpperCase() // hangar pull: departure only
const tailArrOnly = uniqueValue('NC2E').toUpperCase() // return: arrival only
const tailActual = uniqueValue('NC2E').toUpperCase() // scheduled + actual times
const tailNone = uniqueValue('NC2E').toUpperCase() // no times: validation, nothing created
const seeded = [tailExisting, tailDepOnly, tailArrOnly, tailActual, tailNone]
const tails = [tailNew, ...seeded]

test.beforeAll(async () => {
  const { error } = await db
    .from('aircraft')
    .insert(
      seeded.map((tail_number) => ({
        tail_number,
        aircraft_type_icao: 'B738',
        aircraft_type_display: 'Boeing 737-800'
      }))
    )
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

    // KNOWN BUG F2: flips when B10 lands — times are sent with no timezone offset, so Postgres
    // stores the wall-clock value as UTC regardless of the browser's zone. Once fixed, the stored
    // instant must equal the local 14:30 on the chosen date.
    expect(new Date(flight.scheduled_arrival_time as string).toISOString()).toBe(`${date}T14:30:00.000Z`)

    // QT is preselected: departure = arrival + 1 h (F1: no more fabricated +45 min), saved as a quick turn.
    expect(new Date(flight.scheduled_departure_time as string).toISOString()).toBe(`${date}T15:30:00.000Z`)
    expect(flight.is_quick_turn).toBe(true)

    await expect(page.getByText(tailNew).first()).toBeVisible({ timeout: 15_000 })
    // A quick turn shows in both columns.
    await expect(page.getByText(tailNew)).toHaveCount(2)
  })

  test('flight for an existing aircraft with arrival and departure times', async ({ page }) => {
    await openAddFlightSheet(page)
    const date = await page.locator('#date').inputValue()

    await page.getByPlaceholder('e.g., N12345').fill(tailExisting)
    await pickAircraftType(page, 'b738', /B738/)
    await page.locator('#arrivalTime').fill('09:00')
    await expect(page.locator('#departureTime')).toHaveValue('10:00') // QT: arrival + 1 h
    await page.locator('#departureTime').fill('11:20')
    await expect(page.getByRole('checkbox', { name: 'QT' })).not.toBeChecked() // editing departure unchecks QT
    await page.locator('#origin').fill('KBOS')
    await page.locator('#destination').fill('KMIA')
    await page.getByRole('checkbox', { name: 'Hangar' }).click()
    await submitAndExpectClosed(page)

    const flight = await readFlight(tailExisting)
    expect(flight.origin).toBe('KBOS')
    expect(flight.destination).toBe('KMIA')
    expect(flight.services).toEqual(['hangar'])
    // KNOWN BUG F2: flips when B10 lands — stored as UTC wall-clock, no offset applied.
    expect(new Date(flight.scheduled_arrival_time as string).toISOString()).toBe(`${date}T09:00:00.000Z`)
    expect(new Date(flight.scheduled_departure_time as string).toISOString()).toBe(`${date}T11:20:00.000Z`)
    expect(flight.is_quick_turn).toBe(false)

    const { data: aircraft } = await db.from('aircraft').select('aircraft_type_icao').eq('tail_number', tailExisting).single()
    expect(aircraft?.aircraft_type_icao).toBe('B738')

    await expect(page.getByText(tailExisting).first()).toBeVisible({ timeout: 15_000 })
  })

  test('departure-only entry (hangar pull) stores a NULL arrival and shows only in Departures', async ({ page }) => {
    await openAddFlightSheet(page)
    await page.getByPlaceholder('e.g., N12345').fill(tailDepOnly)
    await pickAircraftType(page, 'b738', /B738/)
    await page.locator('#departureTime').fill('16:45') // QT is still preselected; typing a departure unchecks it
    await expect(page.getByRole('checkbox', { name: 'QT' })).not.toBeChecked()
    await submitAndExpectClosed(page)

    const flight = await readFlight(tailDepOnly)
    expect(flight.scheduled_arrival_time).toBeNull()
    expect(flight.scheduled_departure_time).not.toBeNull()
    expect(flight.is_quick_turn).toBe(false)

    await expect(page.getByText(tailDepOnly).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(tailDepOnly)).toHaveCount(1)
    await page.getByRole('button', { name: 'Arrivals Only' }).click()
    await expect(page.getByText(tailDepOnly)).toHaveCount(0)
  })

  test('arrival-only entry (return) stores a NULL departure and shows only in Arrivals', async ({ page }) => {
    await openAddFlightSheet(page)
    await page.getByPlaceholder('e.g., N12345').fill(tailArrOnly)
    await pickAircraftType(page, 'b738', /B738/)
    await page.locator('#arrivalTime').fill('13:10')
    await expect(page.locator('#departureTime')).toHaveValue('14:10')
    await page.locator('#departureTime').fill('') // blank the computed departure: a return, not a turn
    await expect(page.getByRole('checkbox', { name: 'QT' })).not.toBeChecked()
    await submitAndExpectClosed(page)

    const flight = await readFlight(tailArrOnly)
    expect(flight.scheduled_departure_time).toBeNull()
    expect(flight.scheduled_arrival_time).not.toBeNull()
    expect(flight.is_quick_turn).toBe(false)

    await expect(page.getByText(tailArrOnly).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(tailArrOnly)).toHaveCount(1)
    await page.getByRole('button', { name: 'Departures Only' }).click()
    await expect(page.getByText(tailArrOnly)).toHaveCount(0)
  })

  test('actual times are saved and shown on the card', async ({ page }) => {
    await openAddFlightSheet(page)
    const date = await page.locator('#date').inputValue()
    await page.getByPlaceholder('e.g., N12345').fill(tailActual)
    await pickAircraftType(page, 'b738', /B738/)
    await page.locator('#arrivalTime').fill('10:00')
    await page.locator('#actualArrivalTime').fill('10:07')
    await page.locator('#actualDepartureTime').fill('11:02')
    await submitAndExpectClosed(page)

    const flight = await readFlight(tailActual)
    expect(flight.is_quick_turn).toBe(true)
    expect(new Date(flight.actual_arrival_time as string).toISOString()).toBe(`${date}T10:07:00.000Z`)
    expect(new Date(flight.actual_departure_time as string).toISOString()).toBe(`${date}T11:02:00.000Z`)

    await expect(page.getByText(tailActual).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('QT', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Actual arr:').first()).toBeVisible()
    await expect(page.getByText('Actual dep:').first()).toBeVisible()
  })

  test('submitting with no scheduled time shows an inline message, no alert, and creates nothing', async ({ page }) => {
    await openAddFlightSheet(page)
    let alerted = false
    page.on('dialog', (d) => {
      alerted = true
      void d.dismiss()
    })
    await page.getByPlaceholder('e.g., N12345').fill(tailNone)
    await pickAircraftType(page, 'b738', /B738/)
    await page.getByRole('button', { name: 'Add Flight', exact: true }).last().click()
    await expect(page.locator('#timeError')).toContainText(/scheduled arrival/i)
    await expect(page.getByRole('heading', { name: 'Add New Flight' })).toBeVisible()
    expect(alerted).toBe(false)
    const { data } = await db.from('flight').select('id').eq('aircraft_id', tailNone)
    expect(data ?? []).toHaveLength(0)
  })
})
