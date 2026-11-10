// B40: each time has its own date, so a multi-day stay and an actual time after midnight can be entered,
// are stored as the right instants, and load back into the right date fields on edit.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const localInstant = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString()
const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  const next = new Date(y, m - 1, d + n)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

const stamp = Date.now().toString(36).toUpperCase()
const tailStay = `MD1${stamp}`
const tailMidnight = `MD2${stamp}`
const tails = [tailStay, tailMidnight]
const TAIL_PLACEHOLDER = 'e.g., N12345'

let date: string

const openAddFlightSheet = () => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
  cy.get('#date').invoke('val').then((v) => {
    date = v as string
  })
}

const startFlight = (tail: string) => {
  openAddFlightSheet()
  cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).clear().type(tail)
  cy.get('#aircraftType').click()
  cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
  cy.contains('[role="option"]', /B738/).click()
}

const submit = () => cy.get('[role="dialog"]').contains('button', 'Add Flight').click()

describe('Multi-day dates in the flight form (B40)', () => {
  before(() => {
    cy.task('seedAircraft', tailStay)
    cy.task('seedAircraft', tailMidnight)
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('a 3-day stay: arrival today, departure three days later, and the dates reload on edit', () => {
    startFlight(tailStay)
    cy.get('#arrivalTime').type('10:00')
    cy.get('#quickTurn').should('have.attr', 'data-state', 'checked').click() // QT off: departure is typed by hand
    cy.get('#quickTurn').should('have.attr', 'data-state', 'unchecked')
    cy.get('#departureTime').clear().type('15:00') // clear the QT-computed 11:00 first
    cy.then(() => cy.get('#departureDate').should('have.value', date)) // defaults to the same day
    cy.then(() => cy.get('#departureDate').type(addDays(date, 3)))
    cy.get('#arrivalTime').should('have.value', '10:00')
    cy.get('#departureTime').should('have.value', '15:00')
    cy.contains('3d 5h 0m').should('be.visible')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailStay).should((flight: FlightRow) => {
      expect(new Date(flight.scheduled_arrival_time).toISOString()).to.eq(localInstant(date, '10:00'))
      expect(new Date(flight.scheduled_departure_time).toISOString()).to.eq(localInstant(addDays(date, 3), '15:00'))
      expect(flight.is_quick_turn).to.eq(false)
    })

    cy.visit('/')
    cy.contains('[data-slot="card"]', tailStay, { timeout: 15_000 }).contains('button', 'Edit').click()
    cy.contains('Edit Flight').should('be.visible')
    cy.then(() => cy.get('#date').should('have.value', date))
    cy.then(() => cy.get('#departureDate').should('have.value', addDays(date, 3)))
    cy.get('#departureTime').should('have.value', '15:00')
  })

  it('an actual arrival after midnight takes the next day and survives an edit round trip', () => {
    startFlight(tailMidnight)
    cy.get('#arrivalTime').type('23:00')
    cy.get('#quickTurn').should('have.attr', 'data-state', 'checked').click()
    cy.get('#quickTurn').should('have.attr', 'data-state', 'unchecked')
    cy.get('#departureTime').clear() // unticking QT keeps the computed departure; a return has none
    cy.get('#actualArrivalTime').type('00:20')
    cy.then(() => cy.get('#actualArrivalDate').should('have.value', date))
    cy.then(() => cy.get('#actualArrivalDate').type(addDays(date, 1)))
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailMidnight).should((flight: FlightRow) => {
      expect(new Date(flight.scheduled_arrival_time).toISOString()).to.eq(localInstant(date, '23:00'))
      expect(new Date(flight.actual_arrival_time as string).toISOString()).to.eq(localInstant(addDays(date, 1), '00:20'))
      expect(flight.scheduled_departure_time).to.eq(null)
    })

    cy.visit('/')
    cy.contains('[data-slot="card"]', tailMidnight, { timeout: 15_000 }).contains('button', 'Edit').click()
    cy.contains('Edit Flight').should('be.visible')
    cy.then(() => cy.get('#actualArrivalDate').should('have.value', addDays(date, 1)))
    // Saving unchanged must not move the instants.
    cy.contains('button', 'Update Flight').click()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightByTail', tailMidnight).should((flight: FlightRow) => {
      expect(new Date(flight.actual_arrival_time as string).toISOString()).to.eq(localInstant(addDays(date, 1), '00:20'))
    })
  })
})
