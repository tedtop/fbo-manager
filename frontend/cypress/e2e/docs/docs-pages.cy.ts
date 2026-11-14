// Documentation pages (B27a): the index lists every module, a module page renders its usage guide with the heading
// anchors Help links use, "Open <module>" goes to the module, and any signed-in user can read them.
// The in-app slide-in panel (B27c) is not built yet; add its spec when it lands.
const MODULES = [
  { id: 'flight-operations', title: 'Arrivals / Departures', route: '/' },
  { id: 'equipment', title: 'Equipment', route: '/equipment' },
  { id: 'parking', title: 'Ramp Management (Parking)', route: '/parking' },
  { id: 'fuel-farm', title: 'Fuel Farm', route: '/fuel-farm' },
  { id: 'fuel-dispatch', title: 'Fuel Dispatch', route: '/fuel-dispatch' },
  { id: 'users', title: 'Manage Users', route: '/users' }
]

describe('Documentation pages', () => {
  beforeEach(() => {
    cy.login()
  })

  it('lists every module on the index and opens one', () => {
    cy.visit('/docs')
    cy.contains('h1', 'Documentation').should('be.visible')
    for (const m of MODULES) cy.contains('a', m.title).should('have.attr', 'href', `/docs/${m.id}`)
    cy.contains('a', 'Fuel Dispatch').click()
    cy.location('pathname').should('eq', '/docs/fuel-dispatch')
    cy.get('article h1').first().should('be.visible')
    cy.contains('h2', 'Overview').should('exist')
  })

  it('every module page renders its guide with the standard sections and an Open link to the module', () => {
    for (const m of MODULES) {
      cy.visit(`/docs/${m.id}`)
      cy.get('article').should('have.length.at.least', 1)
      cy.contains('h2', 'Common tasks').should('exist')
      cy.contains('h2', 'Troubleshooting').should('exist')
      cy.contains('a', `Open ${m.title}`).should('have.attr', 'href', m.route)
    }
  })

  it('jumps to a Help anchor and goes back to the module', () => {
    cy.visit('/docs/users#assign-roles')
    cy.get('#assign-roles').should('exist').and('be.visible')
    cy.contains('a', 'Open Manage Users').click()
    cy.location('pathname').should('eq', '/users')
  })

  it('shows the Not Found page for a module that has no docs', () => {
    cy.request({ url: '/docs/no-such-module', failOnStatusCode: false }).its('status').should('eq', 404)
  })

  it('lets a Line Department user read the docs too', () => {
    cy.login('user')
    cy.visit('/docs/flight-operations')
    cy.get('article h1').first().should('be.visible')
  })

  it('sends a signed-out visitor to the login page', () => {
    cy.clearAllCookies()
    cy.visit('/docs')
    cy.location('pathname').should('eq', '/login')
  })
})
