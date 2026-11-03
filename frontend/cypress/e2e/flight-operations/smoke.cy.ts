describe('Flight board smoke', () => {
  const tail = `NCY${Date.now().toString(36).toUpperCase()}`

  before(() => {
    cy.task('seedFlight', { tail, departureInMin: 240 })
  })

  after(() => {
    cy.task('cleanFlights', [tail])
  })

  it('loads the board with a seeded flight', () => {
    cy.login()
    cy.visit('/')
    cy.contains('h2, h3, h1', 'Departures').should('be.visible')
    cy.contains(tail, { timeout: 15_000 }).should('be.visible')
  })
})
