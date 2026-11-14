// A PDF scan on the truck sheet import page is rendered to one JPEG per page in the browser, then each page goes to
// /api/ocr/truck-sheet as its own request, one after the other (Vision quota). The OCR route is STUBBED: no Vision call.
import { makePdf, multipartFiles } from '../../support/pdf'

const SHEET = {
  sheet_date: '2026-11-04',
  truck_number: '5282',
  fuel_type: 'jet_a',
  gallons_down: '',
  starting_gallons: '3000',
  front_meter_start: '100000',
  rear_meter_start: '',
  fueler_initials: 'TT',
  readings: [],
}

const pickPdf = (pages: number) =>
  cy.get('[data-testid="truck-sheet-file-input"]').selectFile(
    { contents: Cypress.Buffer.from(makePdf(pages)), fileName: 'Truck Sheets.pdf', mimeType: 'application/pdf' },
    { force: true }
  )

describe('truck sheet PDF upload', () => {
  let starts: number[]
  beforeEach(() => {
    starts = []
    cy.login('admin')
    cy.intercept('POST', '/api/ocr/truck-sheet', (req) => {
      starts.push(Date.now())
      req.reply({ statusCode: 200, delay: 400, body: SHEET })
    }).as('ocr')
  })

  it('sends one image per PDF page, sequentially, and never the PDF', () => {
    cy.visit('/truck-sheets/new')
    pickPdf(3)
    cy.get('@ocr.all', { timeout: 20_000 }).should('have.length', 3)
    cy.contains('Truck 5282').should('exist')
    cy.get('@ocr.all').then((calls) => {
      const names = (calls as unknown as { request: { body: unknown } }[]).map((c) => multipartFiles(c.request.body))
      expect(names.map((f) => f.length)).to.deep.eq([1, 1, 1])
      expect(names.map((f) => f[0].name)).to.deep.eq(['Truck Sheets-p1.jpg', 'Truck Sheets-p2.jpg', 'Truck Sheets-p3.jpg'])
      expect(names.every((f) => f[0].type === 'image/jpeg')).to.eq(true)
      expect(starts[1] - starts[0]).to.be.gte(350) // the next page waits for the previous answer
      expect(starts[2] - starts[1]).to.be.gte(350)
    })
  })

  it('waits and retries a page the reader rate limited (429), then carries on', () => {
    let calls = 0
    cy.intercept('POST', '/api/ocr/truck-sheet', (req) => {
      calls++
      if (calls === 1) req.reply({ statusCode: 429, headers: { 'Retry-After': '1' }, body: { error: 'Too many requests' } })
      else req.reply({ statusCode: 200, body: SHEET })
    }).as('retried')
    cy.visit('/truck-sheets/new')
    pickPdf(2)
    cy.get('@retried.all', { timeout: 20_000 }).should('have.length', 3) // page 1 twice, page 2 once
    cy.contains('Truck 5282').should('exist')
    cy.contains('still rate limited').should('not.exist')
  })

  it('tells the user when the reader stays rate limited (429), page by page', () => {
    cy.intercept('POST', '/api/ocr/truck-sheet', { statusCode: 429, headers: { 'Retry-After': '1' }, body: { error: 'Too many requests' } }).as('limited')
    cy.visit('/truck-sheets/new')
    cy.viewport(390, 844)
    pickPdf(2)
    cy.contains('still rate limited after 4 tries', { timeout: 30_000 }).should('be.visible')
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth - doc.documentElement.clientWidth).to.be.at.most(0)
    })
  })
})
