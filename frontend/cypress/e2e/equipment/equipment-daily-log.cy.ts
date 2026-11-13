// Fuel truck daily log on the equipment detail page (B71, B80): DPI / nozzle readings with the DPI trend, filter
// changes and the "Filters changed" line on the card, free-text notes, and taking a truck out of service with a reason.
// Own truck; the truck-sheet side of the readings (B80) is covered by truck-sheets/truck-sheet-dpi.cy.ts.
const stamp = Date.now().toString(36).toUpperCase()
const TRUCK = `CYDL${stamp}`
const NAME = `E2E Daily Log ${stamp}`

const openTruck = () => {
  cy.visit('/equipment')
  cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
  cy.contains('h1', NAME).should('be.visible')
}

describe('Fuel truck daily log (equipment detail)', () => {
  before(() => {
    cy.task('seedEquipment', { equipmentId: TRUCK, name: NAME })
  })
  after(() => {
    cy.task('cleanEquipment', [TRUCK]) // readings, filter changes, notes and items go with the row
  })
  beforeEach(() => {
    cy.login()
  })

  it('logs two DPI readings three days apart and shows the rising trend and projection', () => {
    openTruck()
    cy.get('[data-testid="readings-log-section"]').should('contain', 'No readings logged yet.')

    // an empty form is refused
    cy.get('[data-testid="add-reading"]').click()
    cy.get('[data-testid="reading-save"]').click()
    cy.contains('Enter the DPI, the nozzle PSI, or both.').should('be.visible')
    cy.get('#rd-dpi').type('-3')
    cy.get('[data-testid="reading-save"]').click()
    cy.contains('Pressures must be numbers, 0 or more.').should('be.visible')

    cy.get('#rd-dpi').clear().type('5')
    cy.get('#rd-psi').type('30')
    cy.get('#rd-when').type('2026-11-08T08:00')
    cy.get('[data-testid="reading-save"]').click()
    cy.get('[data-testid="reading-form"]').should('not.exist')

    cy.get('[data-testid="add-reading"]').click()
    cy.get('#rd-dpi').type('8')
    cy.get('#rd-psi').type('32')
    cy.get('#rd-when').type('2026-11-11T08:00')
    cy.get('[data-testid="reading-save"]').click()
    cy.get('[data-testid="reading-form"]').should('not.exist')

    cy.get('[data-testid="readings-trend"]')
      .should('contain', 'rising about 1.00 psi per day')
      .and('contain', 'projected to reach 15 psi in about 7 days')
    cy.get('[data-testid="readings-trend"]').find('svg[aria-label="DPI trend"]').should('exist')

    // the card on the list shows the newest reading
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`)
      .closest('.border-l-4')
      .find('[data-testid="latest-reading"]')
      .should('contain', '8 / 32')
  })

  it('logs a filter change, which the card then reports as days ago', () => {
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).closest('.border-l-4').find('[data-testid="filter-status"]').should('contain', 'not logged')
    openTruck()
    cy.get('[data-testid="filter-age"]').should('contain', 'No filter change logged yet.')
    cy.get('[data-testid="add-filter-change"]').click()
    cy.get('#fc-when').type('2026-11-01T07:30')
    cy.get('#fc-what').type('2 x Velcon coalescer')
    cy.get('#fc-dpi').type('14.5')
    cy.get('[data-testid="filter-save"]').click()
    cy.get('[data-testid="filter-row"]').should('have.length', 1).and('contain', '2 x Velcon coalescer').and('contain', 'DPI 14.5')
    cy.get('[data-testid="filter-age"]').should('contain', 'Last changed').and('contain', 'days ago')

    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).closest('.border-l-4').find('[data-testid="filter-status"]').should('contain', 'days ago')

    // delete (browser confirm)
    openTruck()
    cy.on('window:confirm', () => true)
    cy.get('[aria-label="Delete filter change"]').click()
    cy.get('[data-testid="filter-row"]').should('not.exist')
    cy.get('[data-testid="filter-age"]').should('contain', 'No filter change logged yet.')
  })

  it('adds a note and deletes it', () => {
    openTruck()
    cy.get('[data-testid="add-note"]').click()
    cy.get('#n-body').type('Hose reel sticks in the cold')
    cy.get('[data-testid="note-save"]').click()
    cy.get('[data-testid="note-row"]').should('have.length', 1).and('contain', 'Hose reel sticks in the cold')
    cy.on('window:confirm', () => true)
    cy.get('[aria-label="Delete note"]').click()
    cy.get('[data-testid="note-row"]').should('not.exist')
  })

  it('takes the truck out of service with a reason, shown on the card as why it is down', () => {
    cy.visit('/equipment')
    const card = () => cy.get(`[data-testid="equipment-link-${TRUCK}"]`).closest('.border-l-4')
    card().contains('button', 'Available').click()
    card().contains('button', 'Out of Service').click()
    cy.get('[data-testid="out-of-service-form"]').within(() => {
      cy.get('[data-testid="out-of-service-save"]').click()
      cy.contains('Say why it is out of service.').should('be.visible')
      cy.get('#oos-reason').type('Pump seal leaking')
      cy.get('[data-testid="out-of-service-save"]').click()
    })
    cy.get('[data-testid="out-of-service-form"]').should('not.exist')
    card().should('contain', 'Out of Service')
    card().find('[data-testid="down-reason"]').should('contain', 'Pump seal leaking')
    cy.task('getEquipmentById', TRUCK).its('status').should('eq', 'out_of_service')
  })
})
