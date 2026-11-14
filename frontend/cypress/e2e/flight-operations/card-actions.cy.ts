// Flight card action row: Edit, Hide and Fuel are the same size, Fuel opens the fuel order sheet (B121; the full
// request/edit/cancel flows are in fuel-order.cy.ts), and the row fits a 390px phone.
const stamp = Date.now().toString(36).toUpperCase()
const tailFuel = `CA1${stamp}`
const tailDeparted = `CA2${stamp}`
const tailHasFuel = `CA3${stamp}`
const tailPhone = `CA4${stamp}`
const tails = [tailFuel, tailDeparted, tailHasFuel, tailPhone]

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)
const openBoard = (tail: string) => {
  cy.login()
  cy.visit('/')
  cy.contains(tail, { timeout: 15_000 }).should('be.visible')
}

describe('Flight card actions', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    cy.task('seedFlight', { tail: tailFuel, departureInMin: 240 })
    cy.task('seedFlight', { tail: tailDeparted, departureInMin: 300, status: 'departed' })
    cy.task('seedFlight', { tail: tailHasFuel, departureInMin: 360 }).then(() => {
      cy.task('seedFuelOrder', { tail: tailHasFuel, status: 'requested', gallonsRequested: 100 })
    })
    cy.task('seedFlight', { tail: tailPhone, departureInMin: 420 })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('Edit and Hide have identical width and height', () => {
    cy.viewport(1280, 900)
    openBoard(tailFuel)
    card(tailFuel).find('[data-testid="card-edit"]').then(($edit) => {
      card(tailFuel).find('[data-testid="card-hide"]').then(($hide) => {
        const e = $edit[0].getBoundingClientRect()
        const h = $hide[0].getBoundingClientRect()
        expect(Math.round(h.width), 'width').to.eq(Math.round(e.width))
        expect(Math.round(h.height), 'height').to.eq(Math.round(e.height))
      })
    })
    card(tailFuel).find('[data-testid="card-fuel"]').then(($fuel) => {
      card(tailFuel).find('[data-testid="card-edit"]').then(($edit) => {
        expect(Math.round($fuel[0].getBoundingClientRect().width)).to.eq(Math.round($edit[0].getBoundingClientRect().width))
      })
    })
    card(tailFuel).screenshot('card-actions-desktop')
  })

  it('Fuel opens the order sheet and does not put a fuel service on the flight', () => {
    cy.viewport(1280, 900)
    openBoard(tailFuel)
    card(tailFuel).find('[data-service-key="fuel"]').should('not.exist')
    card(tailFuel).find('[data-testid="card-fuel"]').should('be.enabled').and('contain.text', 'Fuel').click()
    cy.get('[data-testid="fuel-sheet"]').should('be.visible').and('contain.text', tailFuel)
    cy.get('[data-testid="fuel-sheet"]').contains('button', 'Close').click()
    cy.get('[data-testid="fuel-sheet"]').should('not.exist')
    cy.task('getFlightServiceKeys', tailFuel).should('deep.eq', [])
    cy.task('getFlightFuelOrders', tailFuel).should('have.length', 0)
  })

  it('a flight that already has an order keeps the Fuel button and shows the status chip', () => {
    cy.viewport(1280, 900)
    openBoard(tailHasFuel)
    card(tailHasFuel).find('[data-testid="card-fuel"]').should('be.enabled')
    card(tailHasFuel).find('[data-testid="fuel-chip"]').should('have.text', 'Fuel requested')
  })

  it('a departed flight has no Fuel button', () => {
    cy.viewport(1280, 900)
    openBoard(tailDeparted)
    card(tailDeparted).find('[data-testid="card-edit"]').should('exist')
    card(tailDeparted).find('[data-testid="card-fuel"]').should('not.exist')
  })

  it('fits a 390px phone: no horizontal overflow, all buttons reachable', () => {
    cy.viewport(390, 844)
    openBoard(tailPhone)
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(390)
    })
    for (const id of ['card-edit', 'card-hide', 'card-fuel', 'card-delete']) {
      card(tailPhone).find(`[data-testid="${id}"]`).scrollIntoView().should('be.visible').then(($b) => {
        const r = $b[0].getBoundingClientRect()
        expect(r.left, `${id} left`).to.be.at.least(0)
        expect(r.right, `${id} right`).to.be.at.most(390)
        const label = $b[0].querySelector('span:not(.sr-only)')
        if (label) expect(label.scrollWidth, `${id} label not clipped`).to.be.at.most(label.clientWidth + 1)
        expect($b[0].scrollWidth, `${id} not clipped`).to.be.at.most($b[0].clientWidth + 1)
      })
    }
    card(tailPhone).screenshot('card-actions-390')
  })
})
