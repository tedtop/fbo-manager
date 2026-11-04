// Realtime refresh on the board (BACKLOG B16 / F10; the realtime insert B08c deferred). The board stays open
// (no reload) while rows are written through the service-role client. Realtime delivers within ~1s; if the
// local stack runs without the realtime service the 30s polling fallback delivers instead, hence the long timeouts.
const tail = `CRT${Date.now().toString(36).toUpperCase()}`
const seen = { timeout: 45_000 }

describe('Flight board realtime refresh', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  after(() => {
    cy.task('cleanFlights', [tail])
  })

  it('shows an inserted flight, reflects an update and drops a soft-deleted one without reload', () => {
    cy.login()
    cy.visit('/')
    cy.contains('h2', 'Departures', { timeout: 15_000 }).should('be.visible')
    cy.window().then((w) => {
      ;(w as unknown as { __noReload: boolean }).__noReload = true
    })
    cy.contains(tail).should('not.exist')

    cy.task('seedFlight', { tail, departureInMin: 60 }).then((id) => {
      cy.contains(tail, seen).should('be.visible')

      // The card shows the destination, so a unique one proves this update (not just any 'Delayed' card) arrived.
      const newDestination = `KD${tail.slice(3)}`
      cy.task('setFlightDestination', { id, destination: newDestination })
      cy.contains(newDestination, seen).should('be.visible')

      cy.task('softDeleteFlight', { id })
      cy.contains(tail, seen).should('not.exist')
    })
    cy.window().its('__noReload').should('eq', true)
  })
})
