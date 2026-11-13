// Line Schedule: the four views (Hourly, Week, Roster, Month) and shift add / edit / delete, each ending in a DB read.
// Own staff users (CyAlpha / CyBravo) are put on the "line" roster for the run and removed afterwards.
const stamp = Date.now().toString(36).toUpperCase()

// Monday of the week the page opens on (it starts on the current week, weeks start on Monday), as YYYY-MM-DD.
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const dayOfWeek = (n: number) => {
  const d = monday()
  d.setDate(d.getDate() + n)
  return iso(d)
}

type Seed = { departmentId: number; createdDepartment: boolean; userIds: number[]; adminRowId: number | null }
let seed: Seed


describe('Line Schedule', () => {
  before(() => {
    cy.task('seedLineSchedule', stamp).then((s) => {
      seed = s as Seed
      cy.task('addShift', { departmentId: seed.departmentId, userId: seed.userIds[0], date: dayOfWeek(1), start: '06:00', end: '16:00' })
      cy.task('addShift', { departmentId: seed.departmentId, userId: seed.userIds[0], date: dayOfWeek(2), start: '22:00', end: '08:00' })
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

  it('shows each employee with their shifts in the Week view, overnight shifts flagged', () => {
    cy.contains('CyAlpha').should('be.visible')
    cy.contains('CyBravo').should('be.visible')
    cy.contains('0600–1600').should('be.visible')
    cy.contains('2200–0800').should('be.visible')
    cy.contains('into next day').should('be.visible')
  })

  it('moves between the Hourly, Roster and Month views', () => {
    cy.contains('[role="tab"]', 'Hourly').click()
    cy.contains('[role="tab"]', 'Hourly').should('have.attr', 'data-state', 'active')
    cy.contains('CyAlpha').should('exist')

    cy.contains('[role="tab"]', 'Roster').click()
    cy.contains('on shift').should('be.visible')
    cy.contains('CyAlpha').should('exist')

    cy.contains('[role="tab"]', 'Month').click()
    cy.contains(new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })).should('be.visible')
    cy.contains('CyAlpha').should('exist')

    // a month-view day jumps to its week
    cy.contains('[role="tab"]', 'Week').click()
    cy.contains('[role="tab"]', 'Week').should('have.attr', 'data-state', 'active')
  })

  it('steps to the next week and back with Today', () => {
    cy.contains('0600–1600').should('be.visible')
    cy.get('button:has(svg.lucide-chevron-right)').click()
    cy.contains('0600–1600').should('not.exist')
    cy.contains('button', 'Today').click()
    cy.contains('0600–1600').should('be.visible')
  })

  it('edits a shift from its chip and saves the new times', () => {
    cy.contains('button', '0600–1600').click()
    cy.contains('[role="dialog"] h2', 'Edit Shift').should('be.visible')
    cy.contains('[role="dialog"] button', '0800–1800').click()
    cy.get('#shift-notes').type('swapped with Bravo')
    cy.contains('[role="dialog"] button', 'Save changes').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.contains('button', '0800–1800').should('be.visible')
    cy.task('getShifts', seed.userIds).then((rows) => {
      const edited = (rows as { shift_date: string; start_time: string; end_time: string; notes: string }[]).find((r) => r.shift_date === dayOfWeek(1))!
      expect(edited).to.include({ start_time: '08:00:00', end_time: '18:00:00', notes: 'swapped with Bravo' })
    })
  })

  it('refuses a shift without times, then adds one for another employee', () => {
    cy.contains('button', 'Add Shift').click()
    cy.contains('[role="dialog"] h2', 'Add Shift').should('be.visible')
    cy.contains('[role="dialog"] button', 'Add shift').click()
    cy.contains('Employee, date, start and end times are required.').should('be.visible')

    cy.get('[role="dialog"] [role="combobox"]').click()
    cy.contains('[role="option"]', 'CyBravo').click()
    cy.get('#shift-date').clear().type(dayOfWeek(3))
    cy.contains('[role="dialog"] button', '1400–2100').click()
    cy.contains('7 hour shift').should('be.visible')
    cy.contains('[role="dialog"] button', 'Add shift').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.contains('button', '1400–2100').should('be.visible')
    cy.task('getShifts', seed.userIds).then((rows) => {
      const added = (rows as { user_id: number; shift_date: string; start_time: string; end_time: string }[]).find((r) => r.user_id === seed.userIds[1])!
      expect(added).to.include({ shift_date: dayOfWeek(3), start_time: '14:00:00', end_time: '21:00:00' })
    })
  })

  it('deletes a shift only after a second click on Confirm delete', () => {
    cy.contains('button', '1400–2100').click()
    cy.contains('[role="dialog"] button', 'Delete').click()
    cy.contains('[role="dialog"] button', 'Confirm delete').should('be.visible')
    cy.task('getShifts', seed.userIds).should('have.length', 3) // nothing deleted by the first click
    cy.contains('[role="dialog"] button', 'Confirm delete').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.contains('button', '1400–2100').should('not.exist')
    cy.task('getShifts', seed.userIds).should('have.length', 2)
  })
})
