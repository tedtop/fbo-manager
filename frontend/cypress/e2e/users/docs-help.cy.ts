// B59b: Users and sign-in documentation: Help on Users opens the guide, the guide links back to /users, and the
// waiting page explains itself (the docs panel is not available to someone with no role).
const panel = () => cy.get('aside[data-docs-panel]')

describe('Users guide Help links', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  it('Users Help opens the guide and its sign-in sections link back to Users', () => {
    cy.viewport(1280, 800)
    cy.login('admin')
    cy.visit('/users')
    cy.get('[data-testid="help-guide"]').click()
    panel().should('have.attr', 'aria-hidden', 'false')
    panel().contains('h3', 'How access works').should('exist')
    panel().contains('h3', 'The four roles').should('exist')
    panel().contains('h3', 'Awaiting access').should('exist')
    panel().find('a[href="/users"]').should('exist')
  })

  it('the Roles help in the user sheet opens the guide at the roles section', () => {
    cy.viewport(1280, 800)
    cy.login('admin')
    cy.visit('/users')
    cy.contains('button', 'Invite User').click()
    cy.get('[data-testid="help-roles"]').click()
    cy.location('hash').should('eq', '#roles')
    panel().should('have.attr', 'aria-hidden', 'false')
    panel().find('#roles').should('exist')
  })

  it('an unknown anchor still opens the Users guide without jumping anywhere', () => {
    cy.viewport(1280, 800)
    cy.login('admin')
    cy.visit('/users?docs=users#no-such-section')
    panel().should('have.attr', 'aria-hidden', 'false')
    panel().contains('h1', 'Manage Users usage guide').should('exist')
    panel().find('#no-such-section').should('not.exist')
  })
})

describe('Awaiting access page explainer', () => {
  const stamp = Date.now().toString(36)
  const email = `cy-docs-${stamp}@example.com`
  const password = `pw-${stamp}`
  let userId: string | null = null

  after(() => {
    if (userId) cy.task('deleteAuthUser', userId)
  })

  it('explains what Awaiting access means to someone with no role', () => {
    cy.task('createNewHireUser', { email, password, givenName: 'Pat', familyName: 'Docs' }).then((id) => {
      userId = id as string
    })
    cy.visit('/login')
    cy.get('#email').type(email)
    cy.get('#password').type(password, { log: false })
    cy.contains('button', /^Sign In$/).click()
    cy.location('pathname', { timeout: 15_000 }).should('eq', '/pending')
    cy.get('[data-testid="pending-explainer"] summary').click()
    cy.get('[data-testid="pending-explainer"]').should('contain.text', 'Front Desk').and('contain.text', 'Check again')
  })
})
