// B140: line schedule edit rights come from the signed-in account's roles, not from a legacy `users` row.
// The dev Administrator has no legacy row (asserted below) and still edits a shift; the view-only
// Line Department account sees the schedule but gets no edit controls.
const stamp = `${Date.now().toString(36).toUpperCase()}R`
type Seed = { departmentId: number; createdDepartment: boolean; userIds: number[] }
let seed: Seed

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const tuesday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 1)
  return iso(d)
}

describe('Line Schedule edit rights (roles, no legacy users row)', () => {
  before(() => {
    cy.task('seedLineSchedule', stamp).then((s) => {
      seed = s as Seed
      cy.task('addShift', { departmentId: seed.departmentId, userId: seed.userIds[0], date: tuesday(), start: '06:00', end: '16:00' })
    })
  })
  after(() => {
    cy.task('cleanLineSchedule', seed)
  })

  it('lets the Administrator edit a shift although the account has no legacy users row', () => {
    cy.task('hasLegacyUserRow', 'admin@minutemanfbo.local').should('eq', false)
    cy.login()
    cy.visit('/line-schedule')
    cy.contains('button', '0600–1600').click()
    cy.contains('[role="dialog"] h2', 'Edit Shift').should('be.visible')
    cy.contains('[role="dialog"] button', '0800–1800').click()
    cy.contains('[role="dialog"] button', 'Save changes').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.task('getShifts', seed.userIds).then((rows) => {
      const edited = (rows as { start_time: string; end_time: string }[])[0]
      expect(edited).to.include({ start_time: '08:00:00', end_time: '18:00:00' })
    })
  })

  it('gives a view-only Line Department account no edit controls', () => {
    cy.login('user')
    cy.visit('/line-schedule')
    cy.contains('h1', 'Schedule').should('be.visible')
    cy.contains('CyAlpha').should('be.visible')
    cy.contains('button', 'Add Shift').should('not.exist')
    // the shift chip is shown but is not clickable: no Edit Shift dialog opens
    cy.contains('button', '0800–1800').click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
  })
})
