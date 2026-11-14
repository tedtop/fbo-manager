// Docs panel (B27b/B27c/B27d): a left slide-in panel that sits beside the flight form instead of over it.
const panel = () => cy.get('aside[data-docs-panel]')
const openBoard = (path = '/') => {
  cy.login()
  cy.visit(path)
  cy.get('[data-testid="zulu-toggle"]', { timeout: 15_000 }).should('be.visible')
}
const openAdd = () => {
  openBoard()
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}
const inViewport = (sel: string) =>
  cy.get(sel).should(($el) => {
    const r = $el[0].getBoundingClientRect()
    expect(r.top, 'heading top').to.be.at.least(-1)
    expect(r.bottom, 'heading bottom').to.be.at.most(Cypress.config('viewportHeight') + 1)
  })

describe('Docs panel', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  describe('desktop 1280x800', () => {
    beforeEach(() => {
      cy.viewport(1280, 800)
    })

    it('toolbar Help opens the guide and the page shifts instead of being covered', () => {
      openBoard('/?q=keepme')
      panel().should('have.attr', 'aria-hidden', 'true')
      cy.get('[data-testid="help-guide"]').click()
      panel().should('have.attr', 'aria-hidden', 'false').and('be.visible')
      cy.get('aside[aria-label="Documentation"]').should('exist')
      cy.location('search').should('contain', 'docs=flight-operations').and('contain', 'q=keepme')
      cy.get('[data-testid="zulu-toggle"]').then(($el) => {
        expect($el[0].getBoundingClientRect().left, 'board shifted right of the panel').to.be.at.least(400)
      })
      cy.get('[data-testid="docs-close"]').click()
      panel().should('have.attr', 'aria-hidden', 'true')
      cy.location('search').should('not.contain', 'docs=').and('contain', 'q=keepme')
    })

    it('opens docs from the open form, keeps both visible, and the typed input survives closing', () => {
      openAdd()
      cy.get('input[placeholder="e.g., N12345"]').as('tail')
      cy.get('@tail').type('123AB') // the form prefills the registration prefix N
      cy.get('[data-testid="help-quick-turn"]').click()
      panel().should('have.attr', 'aria-hidden', 'false')
      cy.contains('h2', 'Add New Flight').should('be.visible') // the form stays open
      cy.contains('h3', 'Quick turn').should('be.visible')
      inViewport('#quick-turn')
      cy.get('#quick-turn').should('have.class', 'docs-highlight')
      cy.screenshot('docs-panel-desktop-form-and-docs', { capture: 'viewport' })
      // Clicking inside the docs does not dismiss the form, and the form is not modal any more
      cy.get('[data-docs-panel] h1').first().click()
      cy.contains('h2', 'Add New Flight').should('be.visible')
      cy.get('#notes').type('typed while docs are open')
      cy.get('#notes').should('have.value', 'typed while docs are open')
      cy.get('[data-testid="docs-close"]').click()
      panel().should('have.attr', 'aria-hidden', 'true')
      cy.location('search').should('not.contain', 'docs=')
      cy.contains('h2', 'Add New Flight').should('be.visible')
      cy.get('@tail').should('have.value', 'N123AB')
      cy.get('#notes').should('have.value', 'typed while docs are open')
    })

    it('the times and services Help buttons jump to their headings', () => {
      openAdd()
      cy.get('[data-testid="help-times"]').click()
      inViewport('#times')
      cy.get('[data-testid="help-services"]').click()
      inViewport('#services')
      cy.location('hash').should('eq', '#services')
    })

    it('Escape inside the docs closes only the docs; Escape in the form closes only the form', () => {
      openAdd()
      cy.get('[data-testid="help-add-flight"]').click()
      panel().should('have.attr', 'aria-hidden', 'false')
      cy.get('[data-testid="docs-close"]').focus().type('{esc}')
      panel().should('have.attr', 'aria-hidden', 'true')
      cy.contains('h2', 'Add New Flight').should('be.visible')
      cy.get('#notes').focus().type('{esc}')
      cy.contains('h2', 'Add New Flight').should('not.exist')
    })

    it('with docs closed the form is modal as before (overlay present)', () => {
      openAdd()
      cy.get('[data-slot="sheet-overlay"]').should('exist')
    })

    it('deep link /?docs=flight-operations#time-zone opens the panel at that heading', () => {
      openBoard('/?docs=flight-operations#time-zone')
      panel().should('have.attr', 'aria-hidden', 'false')
      cy.get('#time-zone').should('exist')
      inViewport('#time-zone')
    })

    it('client navigation keeps the panel open; browser back follows the URL', () => {
      openBoard('/?docs=flight-operations#hide')
      panel().should('have.attr', 'aria-hidden', 'false')
      cy.contains('nav a', 'Parking').click()
      cy.location('pathname').should('eq', '/parking')
      panel().should('have.attr', 'aria-hidden', 'false')
      cy.location('search').should('contain', 'docs=flight-operations')
      cy.go('back')
      cy.location('pathname').should('eq', '/')
    })

    it('Open module link and unauthenticated API', () => {
      openBoard('/?docs=flight-operations')
      cy.contains('[data-docs-panel] a', 'Open module').should('have.attr', 'href', '/')
      cy.request('/api/docs/flight-operations').its('body.docs.0.slug').should('eq', 'usage-guide')
      cy.clearCookies()
      cy.request({ url: '/api/docs/flight-operations', failOnStatusCode: false }).its('status').should('eq', 401)
    })
  })

  describe('phone 390x844', () => {
    beforeEach(() => {
      cy.viewport(390, 844)
    })

    it('docs are full width above the form; Back returns to the form with input intact', () => {
      openAdd()
      cy.get('input[placeholder="e.g., N12345"]').as('tail')
      cy.get('@tail').type('123AB') // the form prefills the registration prefix N
      cy.get('[data-testid="help-quick-turn"]').click()
      panel().should('have.attr', 'aria-hidden', 'false')
      panel().should(($el) => expect($el[0].getBoundingClientRect().width).to.eq(390))
      cy.get('[data-testid="docs-back"]').should('be.visible')
      cy.get('[data-testid="docs-close"]').should('not.be.visible')
      cy.screenshot('docs-panel-phone-docs-over-form', { capture: 'viewport' })
      cy.get('[data-testid="docs-back"]').click()
      panel().should('have.attr', 'aria-hidden', 'true')
      cy.contains('h2', 'Add New Flight').should('be.visible')
      cy.get('@tail').should('have.value', 'N123AB')
    })
  })
})
