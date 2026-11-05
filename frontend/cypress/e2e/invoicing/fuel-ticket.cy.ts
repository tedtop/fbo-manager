import { taskUntil } from '../../support/task-poll'

// Cypress spec. This is the module the 2026-07-03 handoff explicitly flagged: "a
// POS/invoicing ticket-entry form that renders and looks correct but silently doesn't persist to the database."
// createInvoice() (repositories/invoices.repo.ts) does a multi-step write (fueling event -> invoice -> line items ->
// gauge readings, with best-effort rollback since supabase-js has no client transactions), driven entirely through
// client state in components/invoicing/fuel-ticket-sheet.tsx. A repository-layer test can prove the function works;
// only driving the actual form proves the UI actually calls it.
const stamp = Date.now().toString(36).toUpperCase()
const truckId = `E2E-TRK-${stamp}`
const invoiceNumber = `E2E-INV-${stamp}`
const customerName = `E2E Walk-up ${stamp}`

type InvoiceProof = {
  invoice: {
    customer_name: string
    status: string
    total: number | string
    invoice_line_items: Array<{ item_type: string; truck_meter_reading_id: number | null; quantity: number | string }>
  }
  reading: { gallons_pumped: number; invoice_number: string } | null
}

describe('Fuel ticket entry: Complete ticket actually persists', () => {
  before(() => {
    cy.task('seedFuelTruck', { truckId, name: `E2E Truck ${truckId}` })
  })

  after(() => {
    cy.task('cleanInvoicing', { invoiceNumber, truckId })
  })

  it('a digitally-entered fuel ticket creates a real invoice, line item, and fueling event', () => {
    cy.login()
    cy.visit('/invoicing')
    cy.contains('button', 'New ticket').click()

    cy.get('#tk-number').type(invoiceNumber)

    // Customer combobox: write-in flow (no linked account needed for cash).
    cy.get('button[aria-label="Customer name"]').click()
    cy.get('input[placeholder="Search accounts or type a name…"]').type(customerName)
    // Curly quotes in the source ("Use “X” as written"): match on the stable part only.
    cy.contains('as written').click()

    // Fuel truck select (fuel delivery is on by default).
    cy.get('button[aria-label="Fuel truck"]').click()
    cy.contains('[role="option"]', truckId).click()

    cy.get('#tk-quantity').type('150')
    cy.get('#tk-price').type('6.25')

    // Click the (larger) <Label htmlFor="pay-cash"> rather than the sr-only radio input itself: the radio's own
    // hit area is small enough to be reported as covered by the sheet's overlay during the Select's closing animation.
    cy.get('label[for="pay-cash"]').click()

    cy.contains('button', 'Complete ticket').click()

    // The sheet closing without a form error is the "looks like it worked" signal that hid the original bug;
    // the DB read below is what actually proves it.
    cy.contains('Invoice number and customer name are required').should('not.exist')
    cy.contains('button', 'Complete ticket').should('not.exist')

    taskUntil<InvoiceProof | null>('getInvoiceByNumber', invoiceNumber, (proof) => {
      expect(proof, 'invoice row').to.not.eq(null)
      expect(proof!.reading, 'fueling event row').to.not.eq(null)
    }).then((proof) => {
      const { invoice, reading } = proof!
      expect(invoice.customer_name).to.eq(customerName)
      expect(invoice.status).to.eq('paid') // finalize + cash => paid (see invoices.repo.ts statusFor())
      expect(Number(invoice.total)).to.be.closeTo(150 * 6.25, 0.005)

      const lineItems = invoice.invoice_line_items
      expect(lineItems).to.have.length(1)
      expect(lineItems[0].item_type).to.eq('fuel')
      expect(Number(lineItems[0].quantity)).to.eq(150)

      // The fueling event itself: a real, independently-queryable truck_meter_readings row, not just a
      // client-side number that never made it to the database.
      expect(lineItems[0].truck_meter_reading_id).to.not.eq(null)
      expect(reading!.gallons_pumped).to.eq(150)
      expect(reading!.invoice_number).to.eq(invoiceNumber)
    })
  })
})
