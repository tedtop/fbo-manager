// B141: a training completion is attributed to the signed-in account's profile, not a legacy `users` row.
// The dev Administrator has no legacy row; recording a completion still works and shows who recorded it.
const stamp = Date.now().toString(36).toUpperCase()
const COURSE = `CY Attribution ${stamp}`
const ADMIN_EMAIL = 'admin@minutemanfbo.local'
type Seed = { departmentId: number; createdDepartment: boolean; userIds: number[] }
let seed: Seed
let originalName: { first_name: string; last_name: string }
let profileId: string

describe('Training completion attribution (profile, no legacy users row)', () => {
  before(() => {
    cy.task('seedLineSchedule', stamp).then((s) => {
      seed = s as Seed
    })
    cy.task('createTrainingCourse', COURSE)
    cy.task('getProfileByEmail', ADMIN_EMAIL).then((p: any) => {
      profileId = p.id
      originalName = { first_name: p.first_name, last_name: p.last_name }
    })
    cy.task('setProfileName', { email: ADMIN_EMAIL, first: 'Casey', last: 'Recorder' })
  })
  after(() => {
    cy.task('setProfileName', { email: ADMIN_EMAIL, first: originalName.first_name, last: originalName.last_name })
    cy.task('cleanTrainingCourses', [COURSE])
    cy.task('cleanLineSchedule', seed)
  })
  beforeEach(() => {
    cy.login()
    cy.visit('/training')
    cy.contains('h1', 'Training & Compliance').should('be.visible')
    cy.get('input[placeholder="Search staff..."]').type('CyAlpha')
    cy.contains('tr', 'CyAlpha').find('button').last().click()
  })

  it('has no legacy users row for the signed-in account', () => {
    cy.task('hasLegacyUserRow', ADMIN_EMAIL).should('eq', false)
  })

  it('records a completion attributed to the profile and shows "by <name>" in the history', () => {
    cy.contains('[role="dialog"]', COURSE).within(() => {
      cy.contains('button', 'Record completion').click()
      cy.get('#completion-notes').type('Attributed to the profile')
      cy.contains('button', 'Save').click()
    })
    cy.contains('[role="dialog"]', 'by Casey Recorder').should('be.visible')
    cy.task('getTrainingCourse', COURSE).then((c: any) => {
      expect(c.completions).to.have.length(1)
      expect(c.completions[0].recorded_by_profile_id).to.eq(profileId)
      expect(c.completions[0].recorded_by_id).to.eq(null)
    })
  })

  it('shows an error and records nothing when the save fails', () => {
    cy.task('getTrainingCourse', COURSE).then((before: any) => {
      const count = before.completions.length
      cy.intercept('POST', '**/rest/v1/training_completion*', { statusCode: 500, body: { code: 'XX000', message: 'boom', details: null, hint: null } }).as('save')
      cy.contains('[role="dialog"]', COURSE).within(() => {
        cy.contains('button', /Record (completion|renewal)/).click()
        cy.contains('button', 'Save').click()
      })
      cy.wait('@save')
      cy.contains('Failed to record completion').should('be.visible')
      cy.task('getTrainingCourse', COURSE).then((after: any) => expect(after.completions).to.have.length(count))
    })
  })
})
