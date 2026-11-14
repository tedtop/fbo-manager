// Training & Compliance: define a training (Manage trainings), record a completion for a staff member from the
// matrix, see the expiry the course's validity stamps, delete the record, retire the training. Each step ends in a DB read.
// Own staff (CyAlpha / CyBravo on the "line" roster) and an own course; removed afterwards.
const stamp = Date.now().toString(36).toUpperCase()
const COURSE = `CY Ramp Safety ${stamp}`
type Seed = { departmentId: number; createdDepartment: boolean; userIds: number[] }
let seed: Seed

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const inAYear = () => {
  const d = new Date()
  return `${d.getFullYear() + 1}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const mdyy = () => {
  const d = new Date()
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

describe('Training and compliance', () => {
  before(() => {
    cy.task('seedLineSchedule', stamp).then((s) => {
      seed = s as Seed
    })
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

  it('refuses an empty training name, then creates a training with a one-year validity', () => {
    cy.contains('[role="tab"]', 'Manage trainings').click()
    cy.contains('button', 'Add training').click()
    cy.contains('[role="dialog"] button', 'Add training').click()
    cy.contains('Training name is required').should('be.visible')

    cy.get('#course-name').type(COURSE)
    cy.get('#course-url').type('https://example.test/ramp-safety')
    cy.get('#course-instructions').type('Watch the video, pass the quiz.')
    cy.get('[role="dialog"] input[type="number"]').clear().type('1')
    cy.get('[role="dialog"] [role="combobox"]').click()
    cy.contains('[role="option"]', /^Years?$/i).click()
    cy.contains('[role="dialog"] button', 'Add training').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.contains(COURSE).should('be.visible')
    cy.task('getTrainingCourse', COURSE).then((c: any) => {
      expect(c).to.include({ validity_amount: 1, validity_unit: 'years', is_active: true, url: 'https://example.test/ramp-safety' })
    })
  })

  it('does not allow a second training with the same name', () => {
    cy.contains('[role="tab"]', 'Manage trainings').click()
    cy.contains('button', 'Add training').click()
    cy.get('#course-name').type(COURSE)
    cy.contains('[role="dialog"] button', 'Add training').click()
    cy.contains('A training with this name already exists').should('be.visible')
    cy.get('[role="dialog"]').should('exist') // the sheet stays open
    cy.task('getTrainingCourse', COURSE).should('not.eq', null) // still exactly one course of that name (maybeSingle would throw on two)
  })

  it('records a completion for a staff member, stamping the expiry from the validity period', () => {
    cy.contains('th', COURSE).should('be.visible')
    cy.get('input[placeholder="Search staff..."]').type('CyAlpha')
    cy.contains('tr', 'CyAlpha').find('button').last().click()
    cy.contains('[role="dialog"]', COURSE).within(() => {
      cy.contains('Not completed').should('be.visible')
      cy.contains('button', 'Record completion').click()
      cy.get('#completion-notes').type('Classroom session')
      cy.contains('button', 'Save').click()
    })
    cy.contains('[role="dialog"]', 'Expires').should('contain', 'Completed')
    cy.get('body').type('{esc}')
    cy.contains('tr', 'CyAlpha').should('contain', mdyy())
    cy.task('getTrainingCourse', COURSE).then((c: any) => {
      expect(c.completions).to.have.length(1)
      expect(c.completions[0]).to.include({ completed_on: todayIso(), expires_on: inAYear(), notes: 'Classroom session' })
    })
  })

  it('shows the history and lets an admin delete the record', () => {
    cy.get('input[placeholder="Search staff..."]').type('CyAlpha')
    cy.contains('tr', 'CyAlpha').find('button').last().click()
    cy.contains('[role="dialog"]', 'History').should('be.visible')
    cy.get('[title="Delete record"]').click()
    cy.get('[role="dialog"]').contains('Not completed').should('be.visible')
    cy.task('getTrainingCourse', COURSE).then((c: any) => expect(c.completions).to.have.length(0))
  })

  it('retires a training: it leaves the matrix and shows as Inactive', () => {
    cy.contains('[role="tab"]', 'Manage trainings').click()
    cy.contains(COURSE).closest('div.flex.items-center.justify-between').find('[title="Retire training"]').click()
    cy.contains(COURSE).closest('div.flex.items-center.justify-between').contains('Inactive').should('be.visible')
    cy.task('getTrainingCourse', COURSE).then((c: any) => expect(c.is_active).to.eq(false))
    cy.contains('[role="tab"]', 'Compliance matrix').click()
    cy.contains('th', COURSE).should('not.exist')
  })
})
