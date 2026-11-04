import { expect, test } from '@playwright/test'
import { createE2EDbClient } from './support/db'
import { uniqueValue } from './support/unique'

// B16 / F10: the board refreshes on DB changes made elsewhere, with no reload. Rows are written through
// the service-role client (as a second screen / another user would). Realtime delivers within ~1s; if the
// local stack runs without the realtime service the 30s polling fallback delivers instead, so the
// assertions allow for either (the page is never reloaded).
const db = createE2EDbClient()
const tail = uniqueValue('RT').toUpperCase()
const seenTimeout = 45_000
let userId: number

test.beforeAll(async () => {
  const { data: user, error } = await db
    .from('users')
    .insert({ username: uniqueValue('e2e-rt-user-'), password: 'test-password-hash', first_name: 'E2E', last_name: 'Realtime', role: 'line' })
    .select()
    .single()
  if (error) throw error
  userId = user.id
  const { error: aircraftError } = await db
    .from('aircraft')
    .insert({ tail_number: tail, aircraft_type_icao: 'B738', aircraft_type_display: 'Boeing 737-800' })
  if (aircraftError) throw aircraftError
})

test.afterAll(async () => {
  await db.from('flight').delete().eq('tail_number', tail)
  await db.from('aircraft').delete().eq('tail_number', tail)
  await db.from('users').delete().eq('id', userId)
})

test('a flight inserted, updated and soft-deleted elsewhere shows up, changes and disappears without reload', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Departures' })).toBeVisible({ timeout: 15_000 })
  // Marker that survives only if the page is not reloaded.
  await page.evaluate(() => {
    ;(window as unknown as { __noReload: boolean }).__noReload = true
  })
  await expect(page.getByText(tail)).toHaveCount(0)

  const soon = new Date(Date.now() + 60 * 60_000)
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
  const departure = new Date(Math.min(startOfToday + 24 * 3600_000 - 5 * 60_000, Math.max(startOfToday + 5 * 60_000, soon.getTime()))).toISOString()
  const { data: flight, error } = await db
    .from('flight')
    .insert({ created_by_id: userId, tail_number: tail, origin: 'KAAA', destination: 'KBBB', is_quick_turn: false, flight_status: 'scheduled', scheduled_departure_time: departure })
    .select('id')
    .single()
  if (error) throw error
  await expect(page.getByText(tail)).toHaveCount(1, { timeout: seenTimeout })

  // The card shows the destination, so a unique one proves the update (not just any 'Delayed' card) arrived.
  const newDestination = uniqueValue('KD').toUpperCase()
  const { error: updateError } = await db.from('flight').update({ destination: newDestination }).eq('id', flight.id)
  if (updateError) throw updateError
  await expect(page.getByText(newDestination)).toHaveCount(1, { timeout: seenTimeout })

  const { error: deleteError } = await db.from('flight').update({ deleted_at: new Date().toISOString() }).eq('id', flight.id)
  if (deleteError) throw deleteError
  await expect(page.getByText(tail)).toHaveCount(0, { timeout: seenTimeout })

  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
})
