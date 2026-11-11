// Cypress spec (B99): Edit Tank shows the lowest level ever measured (read only), with its date and gallons.
// Uses its own tank (CYB99) with seeded readings; nothing else on the Fuel Farm page is touched.
const TANK = 'CYB99'

const openEdit = () => {
  cy.visit('/fuel-farm')
  cy.get(`button[aria-label="Edit Cy ${TANK}"]`).click()
}

describe('Fuel Farm: lowest measured level', () => {
  beforeEach(() => {
    cy.task('cleanTank', TANK)
    cy.task('seedTankWithReadings', {
      tankId: TANK,
      readings: [
        { level: 60, recordedAt: '2026-01-10T12:00:00Z' },
        { level: 18.5, recordedAt: '2026-02-14T12:00:00Z' },
        { level: 75, recordedAt: '2026-03-01T12:00:00Z' }
      ]
    })
    cy.login()
  })

  after(() => {
    cy.task('cleanTank', TANK)
  })

  it('shows the measured low with its date and gallons, read only', () => {
    openEdit()
    cy.get('[data-testid="lowest-measured"]').should('contain.text', '18.5"').and('contain.text', 'Feb 14, 2026')
    cy.get('[data-testid="lowest-gallons"]').should('contain.text', 'gal')
    cy.get('#lowest_override').should('not.exist')
  })
})
