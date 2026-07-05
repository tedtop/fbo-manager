import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { DEV_USERS } from './support/env'
import { expectConventionalSheet } from './support/ui'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/** Tail numbers get uppercased by the autocomplete input, so fixture values must be
 * uppercase to match what actually lands in the DB. */
function uniqueTailNumber(): string {
  return uniqueValue('E2E').toUpperCase()
}

/** Seeds an aircraft + a departure flight for today directly in the DB — for specs that
 * exercise editing an existing flight rather than the create path. flight.created_by_id
 * is NOT NULL, so this pins it to the seeded admin dev account's legacy users row. */
async function seedFlight(tailNumber: string) {
  const { data: adminUser, error: adminError } = await db
    .from('users')
    .select('id')
    .eq('email', DEV_USERS.admin.email)
    .single()
  if (adminError) throw adminError

  const { error: aircraftError } = await db.from('aircraft').insert({
    tail_number: tailNumber,
    aircraft_type_display: 'E2E Seed Type',
    aircraft_type_icao: 'UNKN',
    airline_icao: '',
    fleet_id: '',
  })
  if (aircraftError) throw aircraftError

  const departure = new Date()
  departure.setHours(23, 0, 0, 0) // late today, so it always renders as an upcoming flight
  const { data: flight, error: flightError } = await db
    .from('flight')
    .insert({
      aircraft_id: tailNumber,
      departure_time: departure.toISOString(),
      flight_status: 'scheduled',
      destination: 'KE2E',
      created_by_id: adminUser.id,
    })
    .select()
    .single()
  if (flightError) throw flightError
  return flight
}

test.describe('Flight operations — flights and aircraft actually persist', () => {
  test('adding a flight with a brand-new tail number creates both the aircraft and the flight', async ({
    page,
  }) => {
    const tailNumber = uniqueTailNumber()
    const aircraftType = uniqueValue('E2E Citation ')

    await page.goto('/')
    await page.getByRole('button', { name: 'Add Flight' }).click()
    // House conventions: form opens as a themed right-side Sheet slide-out.
    const sheet = await expectConventionalSheet(page)
    await expect(sheet.getByText('Add New Flight')).toBeVisible()

    // Tail-number autocomplete: typing an unknown tail offers "Add new aircraft: <tail>",
    // which creates the aircraft row immediately (components/flight-operations/
    // tail-number-autocomplete.tsx) — the only creation path aircraft have in this app.
    await sheet.getByPlaceholder('e.g., N12345').fill(tailNumber)
    await sheet.getByRole('button', { name: `Add new aircraft: ${tailNumber}` }).click()

    // The aircraft row must exist before the flight is even submitted.
    const aircraft = await waitForDbRow(async () => {
      const { data } = await db.from('aircraft').select('*').eq('tail_number', tailNumber).maybeSingle()
      return data
    })
    expect(aircraft.aircraft_type_display).toBe('Unknown')

    // Setting a real type here should update the aircraft row on submit (the dialog calls
    // updateAircraft when the type differs from what the row was created with).
    await sheet.getByLabel('Aircraft Type').fill(aircraftType)

    // Type defaults to "arrival" — arrival time is required, departure disabled.
    await sheet.getByLabel('Arrival Time').fill('10:30')
    await sheet.getByLabel('Origin').fill('KORD')
    await sheet.getByLabel('Contact Name').fill('E2E Pilot')

    await sheet.getByRole('button', { name: 'Add Flight' }).click()

    // The sheet closes unconditionally after submit — handleAddFlight on app/page.tsx
    // swallows createFlight errors with console.error, so a closed sheet is exactly the
    // "looks like it worked" signal that can hide a persistence failure.
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

    const flight = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').eq('aircraft_id', tailNumber).maybeSingle()
      return data
    })
    expect(flight.flight_status).toBe('scheduled')
    expect(flight.origin).toBe('KORD')
    expect(flight.contact_name).toBe('E2E Pilot')
    expect(flight.arrival_time).not.toBeNull()
    // Arrival-only flights get an auto-derived departure 45 min later (DB requires one).
    expect(flight.departure_time).not.toBeNull()

    // And the type edit made it back onto the aircraft row, not just into client state.
    const updatedAircraft = await waitForDbRow(async () => {
      const { data } = await db.from('aircraft').select('*').eq('tail_number', tailNumber).maybeSingle()
      return data?.aircraft_type_display === aircraftType ? data : null
    })
    expect(updatedAircraft.aircraft_type_display).toBe(aircraftType)
  })

  test('editing a flight through the card Edit form persists the change', async ({ page }) => {
    const tailNumber = uniqueTailNumber()
    const seeded = await seedFlight(tailNumber)

    await page.goto('/')
    // Narrow the board to just this flight so the card's Edit button is unambiguous.
    await page.getByPlaceholder('Search flights...').fill(tailNumber)
    await page.getByRole('button', { name: 'Edit' }).click()

    const sheet = await expectConventionalSheet(page)
    await expect(sheet.getByText('Edit Flight')).toBeVisible()
    await sheet.getByLabel('Contact Name').fill('E2E Updated Contact')
    await sheet.getByLabel('Destination').fill('KJFK')
    await sheet.getByRole('button', { name: 'Update Flight' }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

    const row = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').eq('id', seeded.id).maybeSingle()
      return data?.contact_name === 'E2E Updated Contact' ? data : null
    })
    expect(row.destination).toBe('KJFK')
  })

  test('changing status via the card badge dropdown persists the transition', async ({ page }) => {
    const tailNumber = uniqueTailNumber()
    const seeded = await seedFlight(tailNumber)

    await page.goto('/')
    await page.getByPlaceholder('Search flights...').fill(tailNumber)

    // The status badge on the card is a dropdown of status transitions.
    await page.getByText('Scheduled', { exact: true }).click()
    await page.getByRole('menuitem', { name: 'Departed' }).click()

    const row = await waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').eq('id', seeded.id).maybeSingle()
      return data?.flight_status === 'departed' ? data : null
    })
    expect(row.flight_status).toBe('departed')
  })
})
