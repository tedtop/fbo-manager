// Key flows at a phone viewport (390x844, BACKLOG B08e): board load, view toggle, Add Flight sheet,
// edit via sheet, status change. Uses only what is reachable on the mobile layout.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailBoard = `CM1${stamp}`
const tailEdit = `CM2${stamp}`
const tailStatus = `CM3${stamp}`
const tailNew = `CM4${stamp}`
const tails = [tailBoard, tailEdit, tailStatus, tailNew]

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)

const openBoard = (tail: string) => {
  cy.login()
  cy.visit('/')
  cy.contains(tail, { timeout: 15_000 }).should('be.visible')
}

describe('Flight board on a phone (390x844)', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    cy.task('seedFlight', { tail: tailBoard, departureInMin: 240 })
    cy.task('seedFlight', { tail: tailEdit, departureInMin: 300 })
    cy.task('seedFlight', { tail: tailStatus, departureInMin: 360 })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  beforeEach(() => {
    cy.viewport(390, 844)
  })

  it('loads the board with a seeded flight and no horizontal page scroll', () => {
    openBoard(tailBoard)
    cy.window().its('innerWidth').should('eq', 390)
    // B39 (was KNOWN BUG M1): the top nav links and the board toolbar collapse/wrap on a phone, so the page must not scroll sideways.
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(390)
    })
  })

  it('navigation links collapse into a menu button on a phone', () => {
    openBoard(tailBoard)
    cy.contains('nav a', 'Parking').should('not.be.visible')
    cy.get('button[aria-label="Open navigation menu"]').click()
    cy.contains('[role="menuitem"]', 'Parking').should('be.visible')
    cy.contains('[role="menuitem"]', 'Fuel Farm').should('be.visible')
  })

  it('view toggle switches between departures only and split', () => {
    openBoard(tailBoard)
    cy.get('button[title="Departures Only"]').click()
    cy.contains('h2', 'Arrivals').should('not.exist')
    cy.contains(tailBoard).should('be.visible')
    cy.get('button[title="Split View"]').click()
    cy.contains('h2', 'Arrivals').should('exist')
  })

  it('Add Flight sheet fits the screen and creates a flight', () => {
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
    // The sheet slides in from the right: retry until the animation settles, then it must fit the screen.
    cy.get('[role="dialog"]').should(($d) => {
      const r = $d[0].getBoundingClientRect()
      expect(r.left, 'sheet left').to.be.at.least(0)
      expect(r.right, 'sheet right').to.be.at.most(390)
    })

    cy.get('input[placeholder="e.g., N12345"]').type(tailNew)
    cy.get('#aircraftType').click()
    cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
    cy.contains('[role="option"]', /B738/).click()
    cy.get('#arrivalTime').type('13:15')
    cy.get('#origin').type('KTEB')
    cy.get('#destination').type('KASE')

    cy.get('[role="dialog"]').contains('button', 'Add Flight').scrollIntoView().should('be.visible').click()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    cy.task('getFlightByTail', tailNew).should((row: FlightRow | null) => {
      expect(row?.origin).to.eq('KTEB')
      expect(row?.destination).to.eq('KASE')
    })
  })

  it('edit via the sheet persists', () => {
    openBoard(tailEdit)
    card(tailEdit).contains('button', 'Edit').click()
    cy.contains('Edit Flight').should('be.visible')
    cy.get('#origin').clear().type('KJFK')
    cy.contains('button', 'Update Flight').scrollIntoView().should('be.visible').click()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightByTail', tailEdit).its('origin').should('eq', 'KJFK')
  })

  it('status change on the card persists', () => {
    openBoard(tailStatus)
    card(tailStatus).contains('Scheduled').click()
    cy.contains('[role="menuitem"]', 'Delayed').click()
    cy.task('getFlightByTail', tailStatus).its('flight_status').should('eq', 'delayed')
  })
})
