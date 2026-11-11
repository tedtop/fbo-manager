// B78: a staff member's real email replaces the placeholder email on their existing staff account.
// Google itself cannot run here (it needs Google's servers). What this proves, against the local stack only:
//   1. "Set real email" on a staff account updates auth, profiles and the staff `users` row, and the old
//      seed password stops working (the account keeps its identity, so the person's first Continue with
//      Google links by verified email).
//   2. "Link to staff account" on an Awaiting-access Google sign-up deletes that new account and moves its
//      email onto the chosen staff account.
// Every check ends with a direct DB read (cy.task), not the UI toast.

const stamp = Date.now().toString(36)
const seedPassword = 'seed-password-1'

type Account = { authId: string; staffRowId: number }
const created: Account[] = []
let newHireId: string | null = null

const makeStaff = (key: string) => {
  const email = `cy-${key}-${stamp}@minutemanfbo.local`
  return cy
    .task('createStaffAccount', { email, password: seedPassword, firstName: `Cy${key}`, lastName: stamp })
    .then((a) => {
      created.push(a as Account)
      return { email, ...(a as Account) }
    })
}

describe('B78: real email replaces the placeholder email on a staff account', () => {
  after(() => {
    for (const a of created) cy.task('deleteStaffAccount', a)
    if (newHireId) cy.task('deleteAuthUser', newHireId)
  })

  it('Set real email updates auth, profile and staff row, and kills the seed password', () => {
    const realEmail = `cy-real-${stamp}@example.com`
    makeStaff('set').then((staff) => {
      cy.task('canSignInWithPassword', { email: staff.email, password: seedPassword }).should('eq', true)

      cy.login('admin')
      cy.visit('/users')
      cy.get('input[placeholder^="Search by name"]').type(staff.email)
      cy.contains('tr', staff.email).find('button').last().click()
      cy.contains('[role="menuitem"]', 'Set real email').click()
      cy.get('#staff-real-email').type(realEmail)
      cy.contains('button', 'Set email').click()
      cy.contains(`Email set to ${realEmail}`).should('be.visible')

      cy.task('getEmailState', staff).should('deep.eq', {
        authEmail: realEmail,
        profileEmail: realEmail,
        staffEmail: realEmail,
      })
      cy.task('canSignInWithPassword', { email: realEmail, password: seedPassword }).should('eq', false)
      cy.task('canSignInWithPassword', { email: staff.email, password: seedPassword }).should('eq', false)
    })
  })

  it('Link to staff account removes the Awaiting-access Google sign-up and moves its email', () => {
    const googleEmail = `cy-google-${stamp}@example.com`
    makeStaff('link').then((staff) => {
      cy.task('createNewHireUser', {
        email: googleEmail,
        password: `pw-${stamp}`,
        givenName: 'Gina',
        familyName: 'Google',
      }).then((id) => {
        newHireId = id as string

        cy.login('admin')
        cy.visit('/users')
        cy.get('input[placeholder^="Search by name"]').type(googleEmail)
        cy.contains('tr', googleEmail).find('button').last().click()
        cy.contains('[role="menuitem"]', 'Link to staff account').click()
        cy.get('[aria-label="Staff account to link"]').click()
        cy.contains('[role="option"]', staff.email).click()
        cy.contains('button', 'Link account').click()
        cy.contains('Linked.').should('be.visible')

        cy.task('authUserExists', newHireId).should('eq', false)
        cy.task('getEmailState', staff).should('deep.eq', {
          authEmail: googleEmail,
          profileEmail: googleEmail,
          staffEmail: googleEmail,
        })
        cy.task('canSignInWithPassword', { email: googleEmail, password: seedPassword }).should('eq', false)
        newHireId = null
      })
    })
  })

  it('the PATCH route rejects an unauthenticated caller', () => {
    cy.request({ method: 'PATCH', url: '/api/users/not-a-user', body: { email: 'x@example.com' }, failOnStatusCode: false })
      .its('status')
      .should('be.oneOf', [401, 403])
  })
})
