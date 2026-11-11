import { taskUntil } from '../../support/task-poll'

// Cypress spec (B99): Edit Tank shows the lowest level ever measured (read only) and a manual override.
// Uses its own tank (CYB99) with seeded readings; nothing else on the Fuel Farm page is touched.
const TANK = 'CYB99'

const openEdit = () => {
  cy.visit('/fuel-farm')
  cy.get(`button[aria-label="Edit Cy ${TANK}"]`).click()
}
const override = () => cy.get('#lowest_override')

describe('Fuel Farm: lowest level override', () => {
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

  it('shows the measured low with its date, and an empty override', () => {
    openEdit()
    cy.get('[data-testid="lowest-measured"]').should('contain.text', '18.5"').and('contain.text', 'Feb 14, 2026')
    override().should('have.value', '')
    cy.get('[data-testid="lowest-effective"]').should('contain.text', 'measured')
  })

  it('saves an override, survives a reopen, and clearing it removes the row', () => {
    openEdit()
    override().type('12.5')
    cy.get('[role="dialog"]').contains('button', /^Update$/).click()
    cy.contains('Tank updated').should('be.visible')
    taskUntil<{ lowest_level_inches: string } | null>('getTankLevelOverride', TANK, (row) => {
      expect(Number(row?.lowest_level_inches)).to.eq(12.5)
    })

    openEdit()
    override().should('have.value', '12.5')
    cy.get('[data-testid="lowest-effective"]').should('contain.text', '12.5"').and('contain.text', 'manual override')
    cy.get('[data-testid="lowest-measured"]').should('contain.text', '18.5"')

    override().clear()
    cy.get('[role="dialog"]').contains('button', /^Update$/).click()
    cy.contains('Tank updated').should('be.visible')
    taskUntil<unknown>('getTankLevelOverride', TANK, (row) => {
      expect(row).to.eq(null)
    })

    openEdit()
    override().should('have.value', '')
  })
})
