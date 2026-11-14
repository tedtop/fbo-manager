// B28: the Arrivals / Departures guide is reachable from the board toolbar and from the flight form.
const panel = () => cy.get('aside[data-docs-panel]')
const TITLE = 'Arrivals and Departures usage guide'

describe('Arrivals / Departures guide Help links', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  beforeEach(() => {
    cy.viewport(1280, 800)
    cy.login()
    cy.visit('/')
    cy.get('[data-testid="zulu-toggle"]', { timeout: 15_000 }).should('be.visible')
  })

  it('toolbar Help opens the guide, with the link back to the board', () => {
    cy.get('[data-testid="help-guide"]').click()
    panel().should('have.attr', 'aria-hidden', 'false')
    panel().contains('h1', TITLE).should('be.visible')
    panel().contains('a', 'Open module').should('have.attr', 'href', '/')
    panel().contains('h3', 'Getting help').should('exist')
  })

  it('form Help opens the guide at "Add a flight" while the form stays open', () => {
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
    cy.get('[data-testid="help-add-flight"]').click()
    panel().should('have.attr', 'aria-hidden', 'false')
    cy.location('hash').should('eq', '#add-flight')
    panel().find('#add-flight').should('be.visible')
    cy.contains('h2', 'Add New Flight').should('be.visible')
  })

  it('closing the guide keeps what was typed in the form', () => {
    cy.contains('button', 'Add Flight').click()
    cy.get('input[placeholder="e.g., N12345"]').type('123AB')
    cy.get('[data-testid="help-add-flight"]').click()
    panel().should('have.attr', 'aria-hidden', 'false')
    cy.get('[data-testid="docs-close"]').click()
    panel().should('have.attr', 'aria-hidden', 'true')
    cy.get('input[placeholder="e.g., N12345"]').should('have.value', 'N123AB')
  })

  it('an unknown anchor still opens the guide without jumping anywhere', () => {
    cy.visit('/?docs=flight-operations#no-such-section')
    panel().should('have.attr', 'aria-hidden', 'false')
    panel().contains('h1', TITLE).should('exist')
    panel().find('#no-such-section').should('not.exist')
  })
})
