// DPI and nozzle PSI typed on the truck sheet review are saved with the sheet as an equipment_reading (the same history
// the Equipment page's Daily readings and trend use). The OCR route is STUBBED: no Vision call.
import { makePdf } from '../../support/pdf'

const TRUCK = '9932'
const DATE = '2026-07-15'

const extracted = {
  sheet_date: DATE,
  truck_number: TRUCK,
  fuel_type: 'jet_a',
  gallons_down: '',
  starting_gallons: '3000',
  front_meter_start: '1000',
  rear_meter_start: '',
  fueler_initials: 'TT',
  readings: [],
  rotation_degrees: 0,
  rotation_confident: true,
}

describe('DPI and nozzle PSI on the truck sheet', () => {
  beforeEach(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE })
    cy.login('admin')
    cy.intercept('POST', '/api/ocr/truck-sheet', { statusCode: 200, body: extracted }).as('ocr')
  })

  after(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE })
  })

  it('rejects a bad value, then saves DPI and nozzle PSI into the truck daily readings', () => {
    cy.visit('/truck-sheets/new')
    cy.get('[data-testid="truck-sheet-file-input"]').selectFile(
      { contents: Cypress.Buffer.from(makePdf(1)), fileName: 'Truck 9932.pdf', mimeType: 'application/pdf' },
      { force: true }
    )
    cy.get('[data-testid="sheet-dpi"]', { timeout: 30_000 }).type('abc')
    cy.get('[data-testid="sheet-problem"]').should('contain', 'DPI must be a number')
    cy.contains('button', 'Import 1 sheet').should('be.disabled')

    cy.get('[data-testid="sheet-dpi"]').clear().type('6.5')
    cy.get('[data-testid="sheet-nozzle"]').type('44')
    cy.get('[data-testid="sheet-problem"]').should('not.exist')
    cy.contains('button', 'Import 1 sheet').should('be.enabled').click()
    cy.get('[data-testid="import-summary"]', { timeout: 30_000 }).should('contain', 'Imported 1 truck sheet')

    cy.task('getTruckReadings', TRUCK).then((rows) => {
      const readings = rows as { dpi_psi: number; nozzle_psi: number; truck_sheet_id: number | null }[]
      expect(readings).to.have.length(1)
      expect(Number(readings[0].dpi_psi)).to.eq(6.5)
      expect(Number(readings[0].nozzle_psi)).to.eq(44)
      expect(readings[0].truck_sheet_id).to.be.a('number')
    })

    // the truck page lists it in Daily readings
    cy.visit(`/truck-sheets/trucks/${TRUCK}`)
    cy.url({ timeout: 15_000 }).should('include', '/equipment/')
    cy.get('[data-testid="readings-log-section"]').within(() => {
      cy.get('[data-testid="reading-row"]').should('have.length', 1).and('contain', 'DPI 6.5').and('contain', 'Nozzle 44')
    })
  })
})
