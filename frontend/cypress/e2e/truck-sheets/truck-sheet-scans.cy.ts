// Truck sheet scans: a 2-page PDF for one truck imports as ONE sheet with 2 upright page images (page 1 is reported
// rotated, so it is turned landscape), the original PDF is stored once, the truck page shows both pages in order and
// opens one full size, and importing the same pages again is caught. The OCR route is STUBBED: no Vision call.
import { makePdf } from '../../support/pdf'

const TRUCK = '9931'
const DATE = '2026-07-14'

const sheet = (rotation: 0 | 90 | 180 | 270, front: string) => ({
  sheet_date: DATE,
  truck_number: TRUCK,
  fuel_type: 'jet_a',
  gallons_down: '',
  starting_gallons: '3000',
  front_meter_start: front,
  rear_meter_start: '',
  fueler_initials: 'TT',
  readings: [],
  rotation_degrees: rotation,
  rotation_confident: true,
})

const pickPdf = (pages: number, fileName = 'Truck 9931.pdf') =>
  cy.get('[data-testid="truck-sheet-file-input"]').selectFile(
    { contents: Cypress.Buffer.from(makePdf(pages)), fileName, mimeType: 'application/pdf' },
    { force: true }
  )

describe('truck sheet page scans', () => {
  beforeEach(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE })
    cy.login('admin')
    let call = 0
    cy.intercept('POST', '/api/ocr/truck-sheet', (req) => {
      call += 1
      // first page of each upload is "scanned sideways"; the second is upright
      req.reply({ statusCode: 200, body: call % 2 === 1 ? sheet(90, '1000') : sheet(0, '2000') })
    }).as('ocr')
  })

  after(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE })
  })

  it('stores two upright pages of one truck and day, shows them on the truck page, and catches a re-import', () => {
    cy.visit('/truck-sheets/new')
    pickPdf(2)

    // one card, two pages, page 1 turned landscape because the reader said 90
    cy.get('[data-testid="scan-page-2"]', { timeout: 30_000 }).should('exist')
    cy.get('[data-testid="scan-page-3"]').should('not.exist')
    cy.get('[data-testid="scan-page-1"] img').should(($img) => {
      const img = $img[0] as HTMLImageElement
      expect(img.naturalWidth).to.be.greaterThan(img.naturalHeight)
    })
    cy.get('[data-testid="scan-page-2"] img').should(($img) => {
      const img = $img[0] as HTMLImageElement
      expect(img.naturalWidth).to.be.lessThan(img.naturalHeight)
    })
    cy.contains('Turned 90°').should('exist')

    // manual fix: rotate page 1 right, it turns portrait again
    cy.get('[aria-label="Rotate page 1 right"]').click()
    cy.get('[data-testid="scan-page-1"] img').should(($img) => {
      const img = $img[0] as HTMLImageElement
      expect(img.naturalWidth).to.be.lessThan(img.naturalHeight)
    })
    cy.get('[aria-label="Rotate page 1 left"]').click()
    cy.get('[data-testid="scan-page-1"] img').should(($img) => {
      const img = $img[0] as HTMLImageElement
      expect(img.naturalWidth).to.be.greaterThan(img.naturalHeight)
    })

    cy.contains('button', 'Import 1 sheet').should('be.enabled').click()
    cy.get('[data-testid="import-summary"]', { timeout: 30_000 }).should('contain', 'Imported 1 truck sheet')

    cy.task('getTruckSheetScans', TRUCK).then((res) => {
      const { sheets, scans } = res as { sheets: { id: number; page_count: number }[]; scans: Record<string, unknown>[] }
      expect(sheets).to.have.length(1)
      expect(sheets[0].page_count).to.eq(2)
      expect(scans.map((s) => s.page_number)).to.deep.eq([1, 2])
      expect(scans.map((s) => s.rotation_degrees)).to.deep.eq([90, 0])
      const dir = `truck_sheet/2026/07/${DATE}/truck-${TRUCK}`
      scans.forEach((s, i) => {
        const h8 = String(s.content_sha256).slice(0, 8)
        expect(s.storage_path).to.eq(`${dir}/pages/${DATE}_truck-${TRUCK}_p${i + 1}_${h8}.jpg`)
        expect(s.thumb_path).to.match(new RegExp(`^${dir}/thumbs/${DATE}_truck-${TRUCK}_p${i + 1}_[0-9a-f]{8}\\.jpg$`))
      })
      expect(scans[0].original_path).to.match(new RegExp(`^${dir}/original/${DATE}_truck-${TRUCK}_scan-[0-9a-f]{8}\\.pdf$`))
      expect(scans[1].original_path).to.eq(scans[0].original_path) // the PDF is stored once
      expect(scans.map((s) => s.original_page)).to.deep.eq([1, 2])
      expect(String(scans[0].content_sha256)).to.match(/^[0-9a-f]{64}$/)
      expect(scans[0].content_sha256).to.not.eq(scans[1].content_sha256)
      expect(scans[0].fuel_truck_id).to.be.a('number')
      expect(scans[0].scan_date).to.eq(DATE)
    })

    // the truck page: the day with both pages in order, a page opens full size
    cy.visit(`/truck-sheets/trucks/${TRUCK}`)
    cy.get(`[data-testid="truck-day-${DATE}"]`).within(() => {
      cy.get('[data-testid^="scan-thumb-"]').should('have.length', 2)
      cy.get('[data-testid="scan-thumb-1"] img').should('have.attr', 'alt').and('include', 'page 1')
      cy.get('[data-testid="scan-thumb-1"] img').should(($img) => {
        const img = $img[0] as HTMLImageElement
        expect(img.naturalWidth).to.be.greaterThan(img.naturalHeight) // stored upright (landscape page)
        expect(img.src).to.include('/thumbs/') // the list shows the stored thumbnail
        expect(img.naturalWidth).to.be.at.most(400)
      })
      cy.get('[data-testid="scan-thumb-2"]').click()
    })
    cy.get('[data-testid="scan-full"]').should('be.visible').and(($img) => {
      expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0)
    })
    cy.contains('a', 'Open the original file').should('have.attr', 'href').and('include', '.pdf')
    cy.get('body').type('{esc}')

    // the same pages again: the existing sheet is announced, nothing can be imported silently
    cy.visit('/truck-sheets/new')
    pickPdf(2)
    cy.get('[data-testid="duplicate-banner"]', { timeout: 30_000 }).should('contain', 'already exists')
    cy.contains('button', 'Import 1 sheet').should('be.disabled')
    cy.get('[data-testid="attach-pages"]').click()
    cy.contains('Already stored, skipped').should('exist')
    cy.contains('Every page of this sheet is already stored').should('exist')
    cy.contains('button', 'Import 1 sheet').should('be.disabled')
    cy.get('[data-testid="cancel-sheet"]').click()
    cy.get('[data-testid="scan-page-1"]').should('not.exist')

    // different pages for the same truck and day: add them to the existing sheet (no second sheet, no new readings)
    cy.visit('/truck-sheets/new')
    pickPdf(3, 'Truck 9931 late.pdf')
    cy.get('[data-testid="duplicate-banner"]', { timeout: 30_000 }).should('exist')
    cy.get('[data-testid="attach-pages"]').click()
    cy.get('[data-testid="scan-page-1"]').should('contain', 'Page 3')
    cy.contains('button', 'Import 1 sheet').should('be.enabled').click()
    cy.get('[data-testid="import-summary"]', { timeout: 30_000 }).should('contain', 'Added pages to 1 existing sheet')
    cy.task('getTruckSheetScans', TRUCK).then((res) => {
      const { sheets, scans } = res as { sheets: { page_count: number }[]; scans: Record<string, unknown>[] }
      expect(sheets).to.have.length(1)
      expect(sheets[0].page_count).to.eq(5)
      expect(scans.map((s) => s.page_number)).to.deep.eq([1, 2, 3, 4, 5])
    })
    cy.visit(`/truck-sheets/trucks/${TRUCK}`)
    cy.get('[data-testid^="scan-thumb-"]').should('have.length', 5)
  })

  it('will not import a sheet without a truck number or date, and shows the pages on a phone', () => {
    cy.intercept('POST', '/api/ocr/truck-sheet', {
      statusCode: 200,
      body: { ...sheet(0, '1000'), truck_number: '', sheet_date: null },
    })
    cy.viewport(390, 844)
    cy.visit('/truck-sheets/new')
    pickPdf(1)
    cy.get('[data-testid="scan-page-1"]', { timeout: 30_000 }).should('exist')
    cy.get('[data-testid="sheet-problem"]').should('contain', 'truck number')
    cy.contains('button', 'Import 1 sheet').should('be.disabled')
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth - doc.documentElement.clientWidth).to.be.at.most(0)
    })
  })
})
