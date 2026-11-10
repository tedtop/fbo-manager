// B41: explicit Transient / Hangar pull / Return presets in the Add Flight form.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailReturn = `PR1${stamp}`
const tailPull = `PR2${stamp}`
const tails = [tailReturn, tailPull]

const startFlight = (tail: string) => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
  cy.get('input[placeholder="e.g., N12345"]').clear().type(tail)
  cy.get('#aircraftType').click()
  cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
  cy.contains('[role="option"]', /B738/).click()
}

const submit = () => cy.get('[role="dialog"]').contains('button', 'Add Flight').click()

describe('Flight form presets (B41)', () => {
  before(() => {
    cy.task('seedAircraft', tailReturn)
    cy.task('seedAircraft', tailPull)
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('Transient is the default; Return drops the computed departure and QT', () => {
    startFlight(tailReturn)
    cy.get('[data-testid="preset-transient"]').should('have.attr', 'aria-pressed', 'true')
    cy.get('#arrivalTime').type('10:00')
    cy.get('#departureTime').should('have.value', '11:00')
    cy.get('[data-testid="preset-return"]').click()
    cy.get('#departureTime').should('have.value', '')
    cy.get('#quickTurn').should('have.attr', 'data-state', 'unchecked')
    cy.get('[data-testid="preset-return"]').should('have.attr', 'aria-pressed', 'true')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    cy.task('getFlightByTail', tailReturn).should((f: FlightRow) => {
      expect(f.scheduled_arrival_time).not.to.eq(null)
      expect(f.scheduled_departure_time).to.eq(null)
      expect(f.is_quick_turn).to.eq(false)
    })
  })

  it('Hangar pull keeps only a departure and stays selected', () => {
    startFlight(tailPull)
    cy.get('[data-testid="preset-hangar_pull"]').click()
    cy.get('#arrivalTime').should('have.value', '')
    cy.get('#departureTime').type('14:00')
    cy.get('[data-testid="preset-hangar_pull"]').should('have.attr', 'aria-pressed', 'true')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    cy.task('getFlightByTail', tailPull).should((f: FlightRow) => {
      expect(f.scheduled_arrival_time).to.eq(null)
      expect(f.scheduled_departure_time).not.to.eq(null)
      expect(f.is_quick_turn).to.eq(false)
    })
  })
})
