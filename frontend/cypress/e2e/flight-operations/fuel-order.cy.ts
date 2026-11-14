// B121 / D25: the card's one Fuel action. Request (top off and gallons + Prist + time + note), validation, edit,
// cancel with a reason, the status chip for every order state (order status only, never flight.fueled_at), the Fuel
// service gone from the picker, and the sheet on a 390 px phone. Every flow ends with a direct DB read.
const stamp = Date.now().toString(36).toUpperCase()
const t = (n: string) => `FO${n}${stamp}`
const tailTopOff = t('1')
const tailFull = t('2')
const tailInvalid = t('3')
const tailEdit = t('4')
const tailCancel = t('5')
const tailAssigned = t('6')
const tailFueling = t('7')
const tailFilled = t('8')
const tailShort = t('9')
const tailFueledAt = t('A')
const tailCancelled = t('B')
const tailPhone = t('C')
const tailPicker = t('D')
const tails = [tailTopOff, tailFull, tailInvalid, tailEdit, tailCancel, tailAssigned, tailFueling, tailFilled, tailShort, tailFueledAt, tailCancelled, tailPhone, tailPicker]
const fuelerName = 'Tom Tanner' // initials TT; removed again in after()

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)
const sheet = () => cy.get('[data-testid="fuel-sheet"]')
const openBoard = (tail: string) => {
  cy.login()
  cy.visit('/')
  cy.contains(tail, { timeout: 15_000 }).should('be.visible')
}
const openFuel = (tail: string) => {
  card(tail).find('[data-testid="card-fuel"]').click()
  sheet().should('be.visible')
}
const chip = (tail: string) => card(tail).find('[data-testid="fuel-chip"]')

interface OrderRow {
  id: number
  source: string
  status: string
  gallons_requested: string | null
  gallons_delivered: string | null
  fuel_type: string | null
  prist: boolean
  requested_for: string | null
  fuel_request: string | null
  cancel_reason: string | null
  ticket_number: string
}

describe('Board card Fuel action (B121)', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    let i = 0
    for (const tail of tails) cy.task('seedFlight', { tail, departureInMin: 240 + 10 * i++ })
    cy.task('seedFuelOrder', { tail: tailEdit, status: 'requested', gallonsRequested: 100 })
    cy.task('seedFuelOrder', { tail: tailCancel, status: 'assigned', gallonsRequested: 200 })
    cy.task('seedFuelOrder', { tail: tailAssigned, status: 'assigned', fuelerName })
    cy.task('seedFuelOrder', { tail: tailFueling, status: 'fueling', gallonsRequested: 150 })
    cy.task('seedFuelOrder', { tail: tailFilled, status: 'filled', gallonsRequested: 300, gallonsDelivered: 312 })
    cy.task('seedFuelOrder', { tail: tailShort, status: 'filled', gallonsRequested: 300, gallonsDelivered: 250 })
    cy.task('seedFuelOrder', { tail: tailCancelled, status: 'cancelled', cancelReason: 'customer left' })
    cy.task('setFlightFueledAt', { tail: tailFueledAt, at: new Date().toISOString() })
  })

  after(() => {
    cy.task('cleanFuelOrders', { tails, fuelerNames: [fuelerName] })
    cy.task('cleanFlights', tails)
  })

  it('requests a top-off with the defaults: sheet closes, chip shows Fuel requested, one flight_card order is stored', () => {
    cy.viewport(1280, 900)
    openBoard(tailTopOff)
    chip(tailTopOff).should('not.exist')
    openFuel(tailTopOff)
    sheet().contains('Fuel').should('be.visible')
    cy.get('[data-testid="fuel-amount-topoff"]').should('have.attr', 'data-state', 'on')
    cy.get('[data-testid="fuel-type-jet_a"]').should('have.attr', 'data-state', 'on')
    cy.get('[data-testid="fuel-save"]').click()
    sheet().should('not.exist')
    cy.contains(`Fuel requested for ${tailTopOff}`).should('be.visible')
    chip(tailTopOff).should('have.text', 'Fuel requested')
    cy.task('getFlightFuelOrders', tailTopOff).then((rows) => {
      const orders = rows as OrderRow[]
      expect(orders).to.have.length(1)
      expect(orders[0]).to.include({ source: 'flight_card', status: 'requested', fuel_type: 'jet_a', prist: false, gallons_requested: null, requested_for: null, fuel_request: null })
      expect(orders[0].ticket_number).to.match(/^FO-\d+$/)
    })
    cy.task('getFlightServiceKeys', tailTopOff).should('deep.eq', [])
  })

  it('requests gallons with Jet A + Prist, a time wanted and a note, and stores every field', () => {
    cy.viewport(1280, 900)
    openBoard(tailFull)
    openFuel(tailFull)
    cy.get('[data-testid="fuel-amount-gallons"]').click()
    cy.get('[data-testid="fuel-gallons"]').type('300')
    cy.get('[data-testid="fuel-prist"]').click()
    cy.get('[data-testid="fuel-time"]').type('1430')
    cy.get('[data-testid="fuel-note"]').type('tabs, 150 per side')
    cy.get('[data-testid="fuel-save"]').click()
    sheet().should('not.exist')
    chip(tailFull).should('have.text', 'Fuel requested')
    cy.task('getFlightFuelOrders', tailFull).then((rows) => {
      const [order] = rows as OrderRow[]
      expect(order).to.include({ source: 'flight_card', status: 'requested', fuel_type: 'jet_a_plus', prist: true, fuel_request: 'tabs, 150 per side' })
      expect(Number(order.gallons_requested)).to.eq(300)
      const local = new Date(order.requested_for as string).toLocaleTimeString('en-GB', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' })
      expect(local).to.eq('14:30')
    })
  })

  it('Avgas hides the Prist option and is stored as avgas without Prist', () => {
    cy.viewport(1280, 900)
    openBoard(tailPicker)
    openFuel(tailPicker)
    cy.get('[data-testid="fuel-prist"]').should('exist')
    cy.get('[data-testid="fuel-type-avgas_100"]').click()
    cy.get('[data-testid="fuel-prist"]').should('not.exist')
    cy.get('[data-testid="fuel-save"]').click()
    sheet().should('not.exist')
    cy.task('getFlightFuelOrders', tailPicker).then((rows) => {
      expect((rows as OrderRow[])[0]).to.include({ fuel_type: 'avgas', prist: false })
    })
  })

  it('refuses Gallons without an amount and writes nothing', () => {
    cy.viewport(1280, 900)
    openBoard(tailInvalid)
    openFuel(tailInvalid)
    cy.get('[data-testid="fuel-amount-gallons"]').click()
    cy.get('[data-testid="fuel-save"]').click()
    cy.get('[data-testid="fuel-error"]').should('contain.text', 'Enter the gallons wanted')
    sheet().should('be.visible')
    cy.task('getFlightFuelOrders', tailInvalid).should('have.length', 0)
    chip(tailInvalid).should('not.exist')
    cy.get('[data-testid="fuel-gallons"]').type('0')
    cy.get('[data-testid="fuel-save"]').click()
    cy.get('[data-testid="fuel-error"]').should('be.visible')
    cy.get('[data-testid="fuel-time"]').type('9')
    cy.get('[data-testid="fuel-gallons"]').clear().type('50')
    cy.get('[data-testid="fuel-save"]').click()
    sheet().should('not.exist')
    cy.task('getFlightFuelOrders', tailInvalid).should('have.length', 1)
  })

  it('edits the open order: the sheet opens prefilled, saving updates the same order', () => {
    cy.viewport(1280, 900)
    openBoard(tailEdit)
    chip(tailEdit).should('have.text', 'Fuel requested')
    openFuel(tailEdit)
    sheet().contains('Edit fuel order').should('be.visible')
    cy.get('[data-testid="fuel-gallons"]').should('have.value', '100').clear().type('150')
    cy.get('[data-testid="fuel-note"]').type('call on arrival')
    cy.get('[data-testid="fuel-save"]').should('contain.text', 'Update order').click()
    sheet().should('not.exist')
    cy.contains(`Fuel order updated for ${tailEdit}`).should('be.visible')
    cy.task('getFlightFuelOrders', tailEdit).then((rows) => {
      const orders = rows as OrderRow[]
      expect(orders).to.have.length(1)
      expect(Number(orders[0].gallons_requested)).to.eq(150)
      expect(orders[0]).to.include({ status: 'requested', fuel_request: 'call on arrival' })
    })
    cy.reload()
    openFuel(tailEdit)
    cy.get('[data-testid="fuel-gallons"]').should('have.value', '150')
  })

  it('cancels from the sheet: a reason is required, then the order is cancelled and the chip says so', () => {
    cy.viewport(1280, 900)
    openBoard(tailCancel)
    chip(tailCancel).should('have.text', 'Fuel assigned')
    openFuel(tailCancel)
    cy.get('[data-testid="fuel-cancel-start"]').click()
    cy.get('[data-testid="fuel-cancel-confirm"]').click()
    cy.get('[data-testid="fuel-error"]').should('contain.text', 'reason')
    cy.task('getFlightFuelOrders', tailCancel).then((rows) => expect((rows as OrderRow[])[0].status).to.eq('assigned'))
    cy.get('[data-testid="fuel-cancel-reason"]').type('customer changed plans')
    cy.get('[data-testid="fuel-cancel-confirm"]').click()
    sheet().should('not.exist')
    cy.contains(`Fuel order cancelled for ${tailCancel}`).should('be.visible')
    chip(tailCancel).should('have.text', 'Fuel cancelled')
    cy.task('getFlightFuelOrders', tailCancel).then((rows) => {
      expect((rows as OrderRow[])[0]).to.include({ status: 'cancelled', cancel_reason: 'customer changed plans' })
    })
    // A cancelled order is not edited: Fuel starts a fresh request.
    openFuel(tailCancel)
    sheet().should('not.contain.text', 'Edit fuel order')
  })

  it('chip states come from the order status: assigned with initials, fueling, filled gallons, short, cancelled', () => {
    cy.viewport(1280, 900)
    cy.login()
    cy.visit('/')
    for (const tail of [tailAssigned, tailFueling, tailFilled, tailShort, tailCancelled]) {
      card(tail).scrollIntoView().should('be.visible')
    }
    chip(tailAssigned).should('have.text', 'Fuel assigned TT').and('have.attr', 'data-tone', 'info')
    chip(tailFueling).should('have.text', 'Fueling').and('have.attr', 'data-tone', 'progress')
    chip(tailFilled).should('have.text', 'Filled 312 gal').and('have.attr', 'data-tone', 'done')
    chip(tailShort).should('have.text', 'Short: filled 250 gal of 300 gal').and('have.attr', 'data-tone', 'warn')
    chip(tailCancelled).should('have.text', 'Fuel cancelled').and('have.attr', 'data-tone', 'muted')
  })

  it('a filled order does not open for edit: Fuel starts a new request', () => {
    cy.viewport(1280, 900)
    openBoard(tailFilled)
    openFuel(tailFilled)
    sheet().should('not.contain.text', 'Edit fuel order')
    cy.get('[data-testid="fuel-cancel-start"]').should('not.exist')
  })

  it('ignores flight.fueled_at: a flight marked fueled but with no order shows no chip', () => {
    cy.viewport(1280, 900)
    openBoard(tailFueledAt)
    card(tailFueledAt).find('[data-testid="card-fuel"]').should('exist')
    chip(tailFueledAt).should('not.exist')
    cy.task('getFlightFuelOrders', tailFueledAt).should('have.length', 0)
  })

  it('a status change by the line shows on the card after a reload', () => {
    cy.viewport(1280, 900)
    openBoard(tailEdit)
    cy.task('getFlightFuelOrders', tailEdit).then((rows) => {
      cy.task('setFuelOrderStatus', { id: (rows as OrderRow[])[0].id, status: 'filled', gallonsDelivered: 148 })
    })
    cy.reload()
    chip(tailEdit).should('have.text', 'Short: filled 148 gal of 150 gal')
  })

  it('the Fuel service is gone from the flight form picker', () => {
    cy.viewport(1280, 900)
    cy.task('countActiveServices').should('eq', 15)
    openBoard(tailPicker)
    card(tailPicker).contains('button', 'Edit').click()
    cy.contains('Edit Flight').should('be.visible')
    cy.get('button[data-service-key="hangar"]').should('exist')
    cy.get('button[data-service-key="fuel"]').should('not.exist')
  })

  it('fits a 390px phone: the Fuel button and the whole sheet are reachable with no horizontal overflow', () => {
    cy.viewport(390, 844)
    openBoard(tailPhone)
    card(tailPhone).find('[data-testid="card-fuel"]').scrollIntoView().should('be.visible').then(($b) => {
      const r = $b[0].getBoundingClientRect()
      expect(r.left).to.be.at.least(0)
      expect(r.right).to.be.at.most(390)
    })
    openFuel(tailPhone)
    // Retries until the slide-in animation has settled.
    sheet().should(($s) => {
      const r = $s[0].getBoundingClientRect()
      expect(r.left, 'sheet left').to.be.at.least(0)
      expect(r.right, 'sheet right').to.be.at.most(390)
      expect($s[0].scrollWidth, 'sheet scrollWidth').to.be.at.most($s[0].clientWidth + 1)
    })
    for (const id of ['fuel-amount-gallons', 'fuel-amount-topoff', 'fuel-type-jet_a', 'fuel-type-avgas_100', 'fuel-time', 'fuel-note', 'fuel-save']) {
      cy.get(`[data-testid="${id}"]`).scrollIntoView().should('be.visible').then(($e) => {
        const r = $e[0].getBoundingClientRect()
        expect(r.left, `${id} left`).to.be.at.least(0)
        expect(r.right, `${id} right`).to.be.at.most(390)
      })
    }
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(390))
    sheet().screenshot('fuel-sheet-390')
    cy.get('[data-testid="fuel-save"]').click()
    sheet().should('not.exist')
    chip(tailPhone).should('have.text', 'Fuel requested')
  })
})
