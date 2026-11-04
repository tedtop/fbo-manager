// Mirror of e2e/flight-airports.e2e.ts (Playwright): Origin / Destination are airport comboboxes (B50).
// Needs the airport seed in the local database. Assumes the default Settings (home airport KMSO, FAA codes).
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailGpi = `CA1${stamp}`
const tailHome = `CA2${stamp}`
const tails = [tailGpi, tailHome]

const TAIL_PLACEHOLDER = 'e.g., N12345'

const openAddFlightSheet = () => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}

const typeTail = (tail: string) => {
  cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).clear().type(tail)
}

const pickAircraftType = () => {
  cy.get('#aircraftType').click()
  cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
  cy.contains('[role="option"]', /B738/).click()
}

const submit = () => {
  cy.get('[role="dialog"]').contains('button', 'Add Flight').click()
}

describe('Airport pickers on the flight form', () => {
  before(() => {
    tails.forEach((tail) => cy.task('seedAircraft', tail))
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('GPI lists Glacier Park and Guapi; picking Glacier stores KGPI and the card shows GPI', () => {
    openAddFlightSheet()
    typeTail(tailGpi)
    pickAircraftType()
    cy.get('#arrivalTime').type('13:10')

    cy.get('#origin').click()
    cy.get('input[placeholder^="Code or name"]').type('GPI')
    cy.contains('[cmdk-item]', 'Guapi').should('be.visible')
    cy.contains('GPI matches more than one airport').should('be.visible')
    cy.contains('[cmdk-item]', 'Glacier Park Intl').click()
    cy.get('#origin').should('contain.text', 'Glacier Park')

    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailGpi).then((flight: FlightRow) => {
      expect(flight.origin).to.eq('KGPI')
    })
    cy.get('[data-testid="flight-origin"][title^="KGPI"]', { timeout: 15_000 })
      .first()
      .should('have.text', 'GPI')
      .and('have.attr', 'title')
      .and('match', /Glacier Park/)
  })

  it('prefills the home airport on the known end and saves it as KMSO', () => {
    openAddFlightSheet()
    cy.get('#origin').should('contain.text', 'Select origin')
    cy.get('#destination').should('contain.text', 'Select destination')

    // Departure only (hangar pull): leaves from home.
    cy.get('#departureTime').type('09:00')
    cy.get('#origin').should('contain.text', 'Missoula')
    cy.get('#destination').should('contain.text', 'Select destination')

    // Arrival added: a turn has no known home end.
    cy.get('#arrivalTime').type('08:00')
    cy.get('#origin').should('contain.text', 'Select origin')

    // Arrival only: lands at home.
    cy.get('#departureTime').clear()
    cy.get('#destination').should('contain.text', 'Missoula')
    cy.get('#origin').should('contain.text', 'Select origin')

    typeTail(tailHome)
    pickAircraftType()
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    cy.task('getFlightByTail', tailHome).then((flight: FlightRow) => {
      expect(flight.destination).to.eq('KMSO')
      expect(flight.origin ?? '').to.eq('') // nothing is known about where it came from
    })
  })
})
