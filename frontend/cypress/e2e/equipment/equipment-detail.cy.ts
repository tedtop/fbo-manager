// Equipment detail page: open a truck from the list, log a maintenance item with a discovery time, resolve it, see the
// meter readings and scan page of a seeded truck sheet, and fit a phone screen. Non-trucks show no readings section.
const TRUCK = '9942'
const DATE = '2026-07-14'
const PLAIN = `E2E-PLAIN-${Date.now().toString(36).toUpperCase()}`

describe('Equipment detail page', () => {
  before(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE })
    cy.task('seedTruckWithSheet', { truck: TRUCK, date: DATE })
    cy.task('seedEquipment', { equipmentId: PLAIN, name: `E2E Plain ${PLAIN}` })
  })

  after(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE }) // also deletes the truck and, by cascade, its items
    cy.task('cleanEquipment', [PLAIN])
  })

  beforeEach(() => {
    cy.login()
  })

  it('logs a maintenance item at 02:00, resolves it, and shows readings and scans of the truck sheet', () => {
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
    cy.url().should('match', /\/equipment\/\d+$/)
    cy.contains('h1', `E2E Fuel Truck ${TRUCK}`).should('be.visible')

    // add an item found at 02:00 (FBO wall clock)
    cy.get('[data-testid="add-maintenance-item"]').click()
    cy.get('#mi-title').type('Dead battery')
    cy.get('#mi-when').type('2026-11-05T02:00')
    cy.get('#mi-notes').type('Would not crank')
    cy.get('[data-testid="maintenance-save"]').click()
    cy.get('[data-testid="maintenance-form"]').should('not.exist')
    cy.get('[data-testid="maintenance-item-open"]')
      .should('have.length', 1)
      .and('contain', 'Dead battery')
      .and('contain', '2026-11-05 02:00')

    // the list shows a count badge
    cy.visit('/equipment')
    cy.get('[data-testid="open-maintenance-count"]').first().should('contain', '1 open maintenance item')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()

    // meter readings and the scan page of the seeded sheet sit together in the day card
    cy.get(`[data-testid="truck-day-${DATE}"]`).within(() => {
      cy.contains('Jet A').should('exist')
      cy.contains('1,000 → 1,100').should('exist')
      cy.contains('5,000 → 5,050').should('exist')
      cy.contains('dd', '150').should('exist') // gallons pumped
      cy.get('[data-testid="scan-thumb-1"]').click()
    })
    cy.get('[data-testid="scan-full"]').should('be.visible')
    cy.get('body').type('{esc}')
    cy.get(`[data-testid="truck-day-${DATE}"]`).contains('a', 'Open the sheet').should('have.attr', 'href').and('match', /^\/truck-sheets\/\d+$/)

    // resolve: moves from open to resolved
    cy.contains('[data-testid="maintenance-item-open"]', 'Dead battery').contains('button', 'Resolve').click()
    cy.get('#mi-notes').type('Replaced battery')
    cy.get('[data-testid="maintenance-save"]').click()
    cy.get('[data-testid="maintenance-item-open"]').should('not.exist')
    cy.get('[data-testid="maintenance-item-resolved"]')
      .should('have.length', 1)
      .and('contain', 'Dead battery')
      .and('contain', 'Replaced battery')
  })

  it('fits a 390 px phone screen without horizontal scroll', () => {
    cy.viewport(390, 844)
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
    cy.get(`[data-testid="truck-day-${DATE}"]`).should('be.visible')
    cy.get('[data-testid="add-maintenance-item"]').click()
    cy.get('#mi-when').should('be.visible')
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth - doc.documentElement.clientWidth).to.be.at.most(0)
    })
  })

  it('hides the readings section for equipment without truck sheets', () => {
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${PLAIN}"]`).click()
    cy.get('[data-testid="maintenance-section"]').should('exist')
    cy.get('[data-testid="readings-section"]').should('not.exist')
  })
})
