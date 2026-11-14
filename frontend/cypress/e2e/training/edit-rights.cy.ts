// B140: training edit rights come from the signed-in account's roles, not from a legacy `users` row.
// The dev Administrator has no legacy row and still creates a course; the view-only Line Department
// account gets no "Manage trainings" tab.
const stamp = Date.now().toString(36).toUpperCase()
const COURSE = `CY Rights ${stamp}`

describe('Training edit rights (roles, no legacy users row)', () => {
  after(() => {
    cy.task('cleanTrainingCourses', [COURSE])
  })

  it('lets the Administrator create a course although the account has no legacy users row', () => {
    cy.task('hasLegacyUserRow', 'admin@minutemanfbo.local').should('eq', false)
    cy.login()
    cy.visit('/training')
    cy.contains('[role="tab"]', 'Manage trainings').click()
    cy.contains('button', 'Add training').click()
    cy.get('#course-name').type(COURSE)
    cy.contains('[role="dialog"] button', 'Add training').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.contains(COURSE).should('be.visible')
    cy.task('getTrainingCourse', COURSE).should('not.eq', null)
  })

  it('shows a view-only Line Department account the matrix but no Manage trainings tab', () => {
    cy.login('user')
    cy.visit('/training')
    cy.contains('h1', 'Training & Compliance').should('be.visible')
    cy.contains('[role="tab"]', 'Compliance matrix').should('be.visible')
    cy.contains('[role="tab"]', 'Manage trainings').should('not.exist')
  })
})
