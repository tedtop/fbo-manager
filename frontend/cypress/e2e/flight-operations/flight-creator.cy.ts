// B17: real creator attribution (F9). A flight created through the form is attributed to the signed-in
// account's legacy `users` row (matched by email), and the card shows that person's initials and name.
// Edge: a row whose creator data is missing shows the neutral fallback, never a fake "ADM/Admin".
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']
type UsersRow = { id: number; first_name: string; last_name: string; role: string }

const stamp = Date.now().toString(36).toUpperCase()
const tailNew = `CR1${stamp}` // created through the form
const tailLegacy = `CR2${stamp}` // seeded flight whose creator data we blank on the way to the browser
const tails = [tailNew, tailLegacy]

const ADMIN_EMAIL = 'admin@minutemanfbo.local'

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)

describe('Flight creator attribution (B17)', () => {
  let me: UsersRow

  before(() => {
    // The dev admin's legacy users row (the app links the signed-in account to it by email).
    cy.task('ensureUsersRowForEmail', {
      email: ADMIN_EMAIL,
      username: 'cy-dev-admin',
      firstName: 'Dev',
      lastName: 'Admin',
      role: 'admin',
    }).then((row) => {
      me = row as UsersRow
    })
    cy.task('seedAircraft', tailNew)
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('a flight created while signed in is attributed to the signed-in user, and the card shows them', () => {
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
    cy.get('input[placeholder="e.g., N12345"]').clear().type(tailNew)
    cy.get('#aircraftType').click()
    cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
    cy.contains('[role="option"]', /B738/).click()
    cy.get('#arrivalTime').type('09:00')
    cy.pickAirport('origin', 'KBOS')
    cy.pickAirport('destination', 'KMIA')
    cy.get('[role="dialog"]').contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    // The database row is the proof: created_by_id is the signed-in user's users.id (not the default 1).
    cy.task('getFlightByTail', tailNew).then((flight) => {
      const row = flight as FlightRow
      expect(row.created_by_id).to.eq(me.id)
      expect(row.created_by_id).not.to.eq(1)
    })

    // The card shows their initials, and the tooltip their full name and department.
    const initials = `${me.first_name[0]}${me.last_name[0]}`.toUpperCase()
    card(tailNew).should('contain.text', initials)
    card(tailNew).should('not.contain.text', 'USR').and('not.contain.text', 'ADM')
    card(tailNew).contains('span', new RegExp(`^${initials}$`)).trigger('pointermove', { pointerType: 'mouse' })
    cy.contains('[role="tooltip"]', `${me.first_name} ${me.last_name}`.trim()).should('be.visible')
  })

  it('a row with no creator data shows the neutral fallback, not a fake admin', () => {
    cy.task('seedFlight', { tail: tailLegacy, departureInMin: 360 })
    // The joined creator is blanked on the way to the browser (a legacy row the app cannot attribute).
    cy.intercept({ method: 'GET', pathname: '/rest/v1/flight' }, (req) => {
      req.continue((res) => {
        if (Array.isArray(res.body)) {
          res.body = res.body.map((r: { tail_number?: string }) =>
            r.tail_number === tailLegacy ? { ...r, created_by: null } : r
          )
        }
      })
    })
    cy.login()
    cy.visit('/')
    cy.contains(tailLegacy, { timeout: 15_000 }).should('be.visible')
    card(tailLegacy).contains('span', /^--$/).should('be.visible')
    card(tailLegacy).should('not.contain.text', 'ADM').and('not.contain.text', 'USR')
    card(tailLegacy).contains('span', /^--$/).trigger('pointermove', { pointerType: 'mouse' })
    cy.contains('[role="tooltip"]', 'Unknown creator').should('be.visible')
  })
})
