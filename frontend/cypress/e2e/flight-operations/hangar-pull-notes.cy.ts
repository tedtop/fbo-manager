// B24: service notes are a prominent callout on the card; departure-only = Hangar pull badge.
const stamp = Date.now().toString(36).toUpperCase()
const tailPull = `HP1${stamp}` // departure only, with notes
const tailPlain = `HP2${stamp}` // departure only, no notes
const tails = [tailPull, tailPlain]

const openAddFlightSheet = () => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}

const fillPull = (tail: string, notes?: string) => {
  cy.get('input[placeholder="e.g., N12345"]').clear().type(tail)
  cy.get('#aircraftType').click()
  cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
  cy.contains('[role="option"]', /B738/).click()
  cy.get('#departureTime').type('16:45') // QT is preselected; typing a departure unchecks it
  cy.pickAirport('origin', 'KLAX')
  cy.pickAirport('destination', 'KTEB')
  if (notes) cy.get('#notes').type(notes)
  cy.get('[role="dialog"]').contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('not.exist')
}

const cardFor = (tail: string) => cy.contains('[data-testid="flight-card"]', tail, { timeout: 15_000 })

describe('Hangar pull with service notes (B24)', () => {
  before(() => {
    tails.forEach((t) => cy.task('seedAircraft', t))
  })
  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('the Notes field nudges service notes', () => {
    openAddFlightSheet()
    cy.get('#notes').should('have.attr', 'placeholder').and('contain', 'T/O fuel')
  })

  it('departure-only flight with notes shows the notes callout and the Hangar pull badge', () => {
    openAddFlightSheet()
    fillPull(tailPull, 'T/O fuel 100 gal, TKS fluid')
    cardFor(tailPull).within(() => {
      cy.get('[data-testid="flight-card-notes"]').should('be.visible').and('contain.text', 'T/O fuel 100 gal, TKS fluid')
      cy.get('[data-testid="flight-card-pull-badge"]').should('be.visible').and('have.text', 'Hangar pull')
    })
  })

  it('a flight without notes shows the badge but no notes callout', () => {
    openAddFlightSheet()
    fillPull(tailPlain)
    cardFor(tailPlain).within(() => {
      cy.get('[data-testid="flight-card-pull-badge"]').should('have.text', 'Hangar pull')
      cy.get('[data-testid="flight-card-notes"]').should('not.exist')
    })
  })
})
