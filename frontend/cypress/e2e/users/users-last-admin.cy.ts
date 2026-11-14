// B96: the last active Administrator cannot be demoted, deactivated or deleted. The database enforces it
// (migration 20261113000500); the Users page shows a friendly message. A signed-in manager is always an
// active Administrator themselves, so through the UI the only "last admin" a manager can hit is themselves
// (the app's own guards stop that); the database refusal is proven with direct DB attempts (cy.task).

const stamp = Date.now().toString(36)
const password = `pw-${stamp}`
const adminEmail = 'admin@minutemanfbo.local'
const secondAdminEmail = `cy-admin2-${stamp}@example.com`
let secondAdminId: string | null = null

const roleSelect = (email: string) => cy.get(`[role="combobox"][aria-label="Role for ${email}"]`)

describe('B96: last active Administrator', () => {
  before(() => {
    cy.task('createNewHireUser', { email: secondAdminEmail, password, givenName: 'Second', familyName: 'Admin' }).then((id) => {
      secondAdminId = id as string
      cy.task('assignRoleByName', { userId: secondAdminId, roleName: 'Administrator' })
    })
  })

  after(() => {
    if (secondAdminId) cy.task('deleteAuthUser', secondAdminId)
  })

  beforeEach(() => {
    cy.login('admin')
    cy.visit('/users')
  })

  it('an admin cannot remove their own Administrator role or deactivate themselves', () => {
    roleSelect(adminEmail).click()
    cy.contains('[role="option"]', 'Front Desk').click()
    cy.contains(/can't remove your own Administrator role/).should('be.visible')

    cy.contains('tr', adminEmail).find('button[aria-haspopup="menu"]').click()
    cy.contains('[role="menuitem"]', 'Deactivate').click()
    cy.contains(/can't deactivate your own account/).should('be.visible')
  })

  it('with a second admin, demoting one succeeds and is stored', () => {
    cy.contains('tr', secondAdminEmail).should('contain.text', 'Administrator')
    roleSelect(secondAdminEmail).click()
    cy.contains('[role="option"]', 'Front Desk').click()
    cy.contains(/is now Front Desk/).should('be.visible')
    cy.then(() => cy.task('getRoleNames', secondAdminId)).should('deep.eq', ['Front Desk'])
  })

  it('the database refuses to demote, deactivate or delete the last active Administrator', () => {
    cy.task('attemptLastAdminChanges').then((r) => {
      expect(r).to.deep.eq({ demote: 'FBA01', deactivate: 'FBA01', removeProfile: 'FBA01' })
    })
  })
})
