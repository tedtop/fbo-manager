// Training: the edit-concurrency guard on the course form sheet (B63a, docs/edit-concurrency.md).
// A course is edited while "someone else" saves it behind the sheet. Own course + staff, removed afterwards.
const stamp = Date.now().toString(36).toUpperCase()
const COURSE = `CY Concurrency ${stamp}`
type Seed = { departmentId: number; createdDepartment: boolean; userIds: number[] }
type Course = { instructions: string; updated_at: string }
let seed: Seed

const openEdit = () => {
  cy.contains('[role="tab"]', 'Manage trainings').click()
  cy.contains(COURSE).closest('div.flex.items-center.justify-between').find('[title="Edit"]').click()
  cy.contains('[role="dialog"] h2', 'Edit training').should('be.visible')
}

describe('Training: course edit concurrency', () => {
  before(() => {
    cy.task('seedLineSchedule', stamp).then((s) => {
      seed = s as Seed
    })
    cy.login()
    cy.visit('/training')
    cy.contains('[role="tab"]', 'Manage trainings').click()
    cy.contains('button', 'Add training').click()
    cy.get('#course-name').type(COURSE)
    cy.get('#course-instructions').type('original')
    cy.contains('[role="dialog"] button', 'Add training').click()
    cy.get('[role="dialog"]').should('not.exist')
  })

  after(() => {
    cy.task('cleanTrainingCourses', [COURSE])
    cy.task('cleanLineSchedule', seed)
  })

  beforeEach(() => {
    cy.login()
    cy.visit('/training')
    cy.contains('h1', 'Training & Compliance').should('be.visible')
  })

  it('a normal edit still saves through the guard and moves updated_at', () => {
    cy.task('getTrainingCourse', COURSE).then((before: Course) => {
      openEdit()
      cy.get('#course-instructions').clear().type('guarded save')
      cy.contains('[role="dialog"] button', 'Save changes').click()
      cy.get('[role="dialog"]').should('not.exist')
      cy.task('getTrainingCourse', COURSE).should((after: Course) => {
        expect(after.instructions).to.eq('guarded save')
        expect(after.updated_at).not.to.eq(before.updated_at)
      })
    })
  })

  it('conflict: a course changed behind the sheet shows Reload / Overwrite and keeps the other write', () => {
    openEdit()
    cy.task('touchTrainingCourse', { name: COURSE, instructions: 'changed by someone else' })
    cy.get('#course-instructions').clear().type('my stale edit')
    cy.contains('[role="dialog"] button', 'Save changes').click()

    cy.get('[role="alertdialog"]', { timeout: 10_000 }).should('contain.text', 'Someone else saved changes to this record')
    cy.get('[role="alertdialog"]').contains('button', 'Overwrite anyway').should('be.visible')
    cy.get('[role="alertdialog"]').contains('button', 'Reload their changes').should('be.visible')
    cy.task('getTrainingCourse', COURSE).its('instructions').should('eq', 'changed by someone else')

    cy.get('[role="alertdialog"]').contains('button', 'Reload their changes').click()
    cy.get('[role="alertdialog"]').should('not.exist')
    cy.get('#course-instructions').should('have.value', 'changed by someone else')
    cy.task('getTrainingCourse', COURSE).its('instructions').should('eq', 'changed by someone else')
  })

  it('conflict: Overwrite anyway saves our change over theirs', () => {
    openEdit()
    cy.task('touchTrainingCourse', { name: COURSE, instructions: 'their write' })
    cy.get('#course-instructions').clear().type('our write')
    cy.contains('[role="dialog"] button', 'Save changes').click()
    cy.get('[role="alertdialog"]', { timeout: 10_000 }).contains('button', 'Overwrite anyway').click()
    cy.get('[role="alertdialog"]').should('not.exist')
    cy.task('getTrainingCourse', COURSE).its('instructions').should('eq', 'our write')
  })
})
