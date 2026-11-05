// Port of e2e/flight-timezone.e2e.ts, the edit round-trip (B10 / F2): flight times are real instants.
// The runner pins the browser zone to America/Phoenix (UTC-7, no DST; scripts/test-cypress.ts sets TZ), so the
// expected UTC instants are fixed: local 23:30 is 06:30Z the next UTC day. The other two timezone scenarios
// live in flight-create.cy.ts (23:30 create / reload / edit) and board.cy.ts (calendar more than 4 weeks ahead).
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailEdit = `CZ1${stamp}` // seeded 23:30 -> 00:30, departure edited to 01:15

const phoenixInstant = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-07:00`).toISOString()
// "YYYY-MM-DD" + n calendar days (no timezone involved).
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
// The flight card's "MM/DD HH:mm" label.
const cardLabel = (date: string, hhmm: string) => `${date.slice(5, 7)}/${date.slice(8, 10)} ${hhmm}`
// Local (Phoenix) calendar date `days` ahead of today: a future date, so the default Today + Future view shows it.
const localDateAhead = (days: number) => {
  const d = new Date()
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
  return [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-')
}

describe('Timezone handling (B10)', () => {
  const date = localDateAhead(10)
  const nextDate = addDays(date, 1)

  before(() => {
    cy.task('seedFlight', {
      tail: tailEdit,
      arrivalAt: phoenixInstant(date, '23:30'),
      departureAt: phoenixInstant(nextDate, '00:30'),
      isQuickTurn: true
    })
  })

  after(() => {
    cy.task('cleanFlights', [tailEdit])
  })

  it('editing a seeded 23:30 -> 00:30 flight round-trips and a changed departure lands on the right instant', () => {
    // The expected instants below assume the browser runs in America/Phoenix (UTC-7).
    expect(new Date().getTimezoneOffset(), 'browser zone is America/Phoenix (run with TZ=America/Phoenix)').to.eq(420)

    cy.login()
    cy.visit('/')
    cy.contains('[data-slot="card"]', tailEdit, { timeout: 15_000 }).should('be.visible')
    cy.contains(cardLabel(date, '23:30')).should('be.visible')
    cy.contains('[data-slot="card"]', tailEdit).contains('button', 'Edit').click()
    cy.contains('h2', 'Edit Flight').should('be.visible')
    cy.get('#date').should('have.value', date)
    cy.get('#arrivalTime').should('have.value', '23:30')
    cy.get('#departureTime').should('have.value', '00:30')

    // Move the departure to 01:15 (still after midnight): it must stay on the next local day.
    cy.get('#departureTime').clear().type('01:15')
    cy.contains('button', 'Update Flight').click()
    cy.contains('h2', 'Edit Flight').should('not.exist')

    cy.task('getFlightByTail', tailEdit).should((row: FlightRow) => {
      expect(new Date(row.scheduled_departure_time as string).toISOString()).to.eq(phoenixInstant(nextDate, '01:15'))
      expect(new Date(row.scheduled_arrival_time as string).toISOString()).to.eq(phoenixInstant(date, '23:30'))
    })
    // The card shows the new local time on the same next day.
    cy.contains(cardLabel(nextDate, '01:15'), { timeout: 15_000 }).should('be.visible')
  })
})
