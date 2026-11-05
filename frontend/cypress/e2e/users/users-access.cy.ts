// Port of e2e/users-access.e2e.ts (Playwright). New sign-ups (Google or email) have a profile and no role. They
// must be held on /pending until an admin gives them one in the Users module. Google itself cannot run here (it
// needs Google's servers), so the new account is created through the admin API (cy.task); everything after the
// sign-in redirect is the same path a Google user takes (docs/google-signin.md).
// Two browser sessions in one test: the role-less new user and the admin, each a cy.session (cy.session clears
// the page and cookies when switching).

const stamp = Date.now().toString(36)
const email = `cy-newhire-${stamp}@example.com`
const password = `pw-${stamp}`
let userId: string | null = null

const loginAsNewHire = () =>
  cy.session(
    `newhire-${stamp}`,
    () => {
      // The real login form with email and password (the same app path a Google user lands in afterwards).
      cy.visit('/login')
      cy.get('#email').type(email)
      cy.get('#password').type(password, { log: false })
      cy.contains('button', /^Sign In$/).click()
      cy.location('pathname', { timeout: 15_000 }).should('eq', '/pending')
    },
    {
      validate() {
        cy.getCookies().should('not.be.empty')
      },
    }
  )

describe('New sign-up access: pending page and promotion from Users', () => {
  after(() => {
    if (userId) cy.task('deleteAuthUser', userId)
  })

  it('a role-less user is held on /pending until an admin promotes them', () => {
    cy.task('createNewHireUser', { email, password, givenName: 'Sam', familyName: 'Newhire' }).then((id) => {
      userId = id as string
    })

    // Profile exists with the Google-style name split, and no role.
    cy.then(() => cy.task('getProfileAndRoleCount', userId)).should((p) => {
      const profile = p as { firstName: string; lastName: string; roleCount: number }
      expect([profile.firstName, profile.lastName]).to.deep.eq(['Sam', 'Newhire'])
      expect(profile.roleCount).to.eq(0)
    })

    // The new user, in their own session (no admin session): signing in lands on /pending.
    loginAsNewHire()
    cy.visit('/pending')
    cy.location('pathname').should('eq', '/pending')
    cy.contains('Waiting for access').should('be.visible')

    // Check again with no role yet changes nothing.
    cy.contains('button', 'Check again').click()
    cy.location('pathname').should('eq', '/pending')
    cy.contains('Waiting for access').should('be.visible')

    // Direct navigation to a module bounces back to /pending too.
    cy.visit('/users')
    cy.location('pathname').should('eq', '/pending')

    // The admin sees the sign-up at the top of Users, awaiting access, and promotes them.
    cy.login('admin')
    cy.visit('/users')
    cy.get(`[role="combobox"][aria-label="Role for ${email}"]`).as('roleSelect').should('contain.text', 'Awaiting access')
    cy.get('@roleSelect').click()
    cy.contains('[role="option"]', 'Front Desk').click()
    cy.contains(/is now Front Desk/).should('be.visible')

    // Proof in the database, with the admin recorded as the assigner.
    cy.then(() => cy.task('getRoleAssignment', userId)).should((a) => {
      const assignment = a as { roleName: string; assignedBy: string | null }
      expect(assignment.roleName).to.eq('Front Desk')
      expect(assignment.assignedBy).not.to.eq(null)
    })

    // The new user's next request lets them in: /pending now sends them on (that is what Check again does in
    // the browser; a Cypress session switch discards the open page, so the page is requested fresh instead of
    // clicking the button), and Users stays closed.
    loginAsNewHire()
    cy.visit('/pending')
    cy.location('pathname').should('not.eq', '/pending')
    cy.visit('/users')
    cy.location('pathname').should('not.eq', '/users')
  })

  it('the login page offers Google sign-in', () => {
    cy.visit('/login')
    cy.contains('button', 'Continue with Google').should('be.visible')
  })
})
