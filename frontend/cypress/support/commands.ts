// Dev accounts seeded by e2e/support/seed.ts (same ones the login form's Quick Dev Login buttons use).
const LOGIN_BUTTON = { admin: 'Log in as Admin', user: 'Log in as User' } as const

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Logs in through the real login form (real Supabase Auth cookies), cached per role via cy.session. */
      login(role?: keyof typeof LOGIN_BUTTON): Chainable<void>
    }
  }
}

Cypress.Commands.add('login', (role: keyof typeof LOGIN_BUTTON = 'admin') => {
  cy.session(
    `dev-${role}`,
    () => {
      cy.task('seedDevUsers')
      cy.visit('/login')
      cy.contains('button', LOGIN_BUTTON[role]).click()
      cy.location('pathname', { timeout: 15_000 }).should('eq', '/')
    },
    {
      validate() {
        cy.getCookies().should('not.be.empty')
      },
    }
  )
})

export {}
