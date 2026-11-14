// Line Schedule: the edit-concurrency guard on the shift dialog (B63a, docs/edit-concurrency.md).
// A shift is edited while "someone else" saves it behind the dialog: the guarded save must raise the
// conflict dialog, keep the other write, and offer Reload / Overwrite. Own staff + shifts, removed afterwards.
const stamp = Date.now().toString(36).toUpperCase()

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayOfWeek = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n)
  return iso(d)
}

type Seed = { departmentId: number; createdDepartment: boolean; userIds: number[]; adminRowId: number | null }
type Shift = { id: number; user_id: number; shift_date: string; notes: string; start_time: string; updated_at: string }
let seed: Seed

const shiftOn = (date: string) =>
  cy.task('getShifts', seed.userIds).then((rows) => (rows as Shift[]).find((r) => r.shift_date === date)!)

describe('Line Schedule: shift edit concurrency', () => {
  before(() => {
    cy.task('seedLineSchedule', stamp).then((s) => {
      seed = s as Seed
      // Distinct days so each test owns one shift: day 1 (Tue) edit + conflict/reload, day 2 (Wed) overwrite.
      cy.task('addShift', { departmentId: seed.departmentId, userId: seed.userIds[0], date: dayOfWeek(1), start: '06:00', end: '16:00' })
      cy.task('addShift', { departmentId: seed.departmentId, userId: seed.userIds[0], date: dayOfWeek(2), start: '12:00', end: '22:00' })
    })
  })

  after(() => {
    cy.task('cleanLineSchedule', seed)
  })

  beforeEach(() => {
    cy.login()
    cy.visit('/line-schedule')
    cy.contains('h1', 'Schedule').should('be.visible')
  })

  it('a normal edit still saves through the guard and moves updated_at', () => {
    shiftOn(dayOfWeek(1)).then((before) => {
      cy.contains('button', '0600–1600').click()
      cy.contains('[role="dialog"] h2', 'Edit Shift').should('be.visible')
      cy.get('#shift-notes').clear().type('guarded save')
      cy.contains('[role="dialog"] button', 'Save changes').click()
      cy.get('[role="dialog"]').should('not.exist')
      shiftOn(dayOfWeek(1)).should((after) => {
        expect(after.notes).to.eq('guarded save')
        expect(after.updated_at).not.to.eq(before.updated_at)
      })
    })
  })

  it('conflict: a shift changed behind the dialog shows Reload / Overwrite and keeps the other write', () => {
    shiftOn(dayOfWeek(1)).then((before) => {
      cy.contains('button', '0600–1600').click()
      cy.contains('[role="dialog"] h2', 'Edit Shift').should('be.visible')
      cy.get('#shift-notes').should('have.value', 'guarded save')

      cy.task('touchShift', { id: before.id, notes: 'changed by someone else' })
      cy.get('#shift-notes').clear().type('my stale edit')
      cy.contains('[role="dialog"] button', 'Save changes').click()

      cy.get('[role="alertdialog"]', { timeout: 10_000 }).should('contain.text', 'Someone else saved changes to this record')
      cy.get('[role="alertdialog"]').contains('button', 'Overwrite anyway').should('be.visible')
      cy.get('[role="alertdialog"]').contains('button', 'Reload their changes').should('be.visible')
      shiftOn(dayOfWeek(1)).its('notes').should('eq', 'changed by someone else')

      cy.get('[role="alertdialog"]').contains('button', 'Reload their changes').click()
      cy.get('[role="alertdialog"]').should('not.exist')
      cy.get('#shift-notes').should('have.value', 'changed by someone else')
      shiftOn(dayOfWeek(1)).its('notes').should('eq', 'changed by someone else')
    })
  })

  it('conflict: Overwrite anyway saves our change over theirs', () => {
    shiftOn(dayOfWeek(2)).then((before) => {
      cy.contains('button', '1200–2200').click()
      cy.contains('[role="dialog"] h2', 'Edit Shift').should('be.visible')
      cy.task('touchShift', { id: before.id, notes: 'their write' })
      cy.get('#shift-notes').type('our write')
      cy.contains('[role="dialog"] button', 'Save changes').click()
      cy.get('[role="alertdialog"]', { timeout: 10_000 }).contains('button', 'Overwrite anyway').click()
      cy.get('[role="alertdialog"]').should('not.exist')
      shiftOn(dayOfWeek(2)).its('notes').should('eq', 'our write')
    })
  })
})
