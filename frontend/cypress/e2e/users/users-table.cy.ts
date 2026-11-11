import { taskUntil } from '../../support/task-poll'

// B107: Users table: column sorting, Phone column, spreadsheet-style inline editing, enforced phone mask.
// Every save is checked with a direct DB read (cy.task), not just the on-screen "Saved".

const stamp = Date.now().toString(36)
const password = 'seed-password-1'

type Account = { authId: string; staffRowId: number }
const created: Account[] = []

const makeStaff = (key: string, firstName: string, lastName: string) => {
  const email = `cy-${key}-${stamp}@minutemanfbo.local`
  return cy.task('createStaffAccount', { email, password, firstName, lastName }).then((a) => {
    created.push(a as Account)
    return { email, ...(a as Account) }
  })
}

const search = (q: string) => cy.get('input[placeholder^="Search by name"]').clear().type(q)
const cell = (id: string, field: string) => cy.get(`[data-cell="${id}:${field}"]`)
// Cypress cannot type {tab}; send the key the cell editor listens for.
const pressTab = (el: Cypress.Chainable) => el.trigger('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9 })
const rowNames = () => cy.get('tbody tr').then(($rows) => [...$rows].map((r) => r.querySelector('td')?.textContent?.trim() ?? ''))

describe('B107: Users table sort, inline edit and phone mask', () => {
  let a: Account & { email: string }
  let b: Account & { email: string }

  before(() => {
    // A sorts first by last name (Aaa) even though its first name (Zed) sorts last.
    makeStaff('a', 'Zed', `Aaa${stamp}`).then((x) => {
      a = x
    })
    makeStaff('b', 'Abe', `Zzz${stamp}`).then((x) => {
      b = x
    })
  })

  after(() => {
    cy.task('setAppSetting', { key: 'user_name_sort', value: null })
    for (const acc of created) cy.task('deleteStaffAccount', acc)
  })

  beforeEach(() => {
    cy.task('setAppSetting', { key: 'user_name_sort', value: null }) // default: last name first
    cy.login('admin')
    cy.visit('/users')
    cy.contains('th', 'Phone').should('be.visible')
    search(stamp)
    cy.get('tbody tr').should('have.length', 2)
  })

  it('sorts by name (last, then first) by default, and by any header with an indicator', () => {
    cy.get('th[aria-sort="ascending"]').should('contain', 'Name')
    rowNames().should('deep.eq', [`Zed Aaa${stamp}`, `Abe Zzz${stamp}`])

    cy.get('[data-sort="name"]').click()
    cy.get('th[aria-sort="descending"]').should('contain', 'Name')
    rowNames().should('deep.eq', [`Abe Zzz${stamp}`, `Zed Aaa${stamp}`])

    cy.get('[data-sort="email"]').click()
    cy.get('th[aria-sort="ascending"]').should('contain', 'Email')
    rowNames().should('deep.eq', [`Zed Aaa${stamp}`, `Abe Zzz${stamp}`]) // cy-a-... before cy-b-...
    cy.get('[data-sort="email"]').click()
    rowNames().should('deep.eq', [`Abe Zzz${stamp}`, `Zed Aaa${stamp}`])

    for (const key of ['phone', 'role', 'joined', 'employee_id', 'badge_id', 'status']) {
      cy.get(`[data-sort="${key}"]`).click()
      cy.get('th[aria-sort="ascending"] [data-sort]').should('have.attr', 'data-sort', key)
    }
  })

  it('"No name yet" rows stay last in both directions', () => {
    cy.get('input[placeholder^="Search by name"]').clear()
    cy.get('tbody tr').then(($rows) => {
      const hasNoName = [...$rows].some((r) => r.textContent?.includes('No name yet'))
      if (!hasNoName) return
      const lastIsNoName = () => cy.get('tbody tr').last().should('contain', 'No name yet')
      lastIsNoName()
      cy.get('[data-sort="name"]').click()
      lastIsNoName()
    })
  })

  it('edits phone in place: masked as you type, Enter saves, stored masked', () => {
    cell(a.authId, 'phone').find('button').click()
    cell(a.authId, 'phone').find('input').type('abc5555551234999')
    cell(a.authId, 'phone').find('input').should('have.value', '(555) 555-1234')
    cell(a.authId, 'phone').find('input').type('{enter}')
    cell(a.authId, 'phone').should('contain', '(555) 555-1234')
    cell(a.authId, 'phone').find('[data-cell-state="saved"]').should('exist')
    cy.task('getProfileFields', a.authId).then((p: any) => {
      expect(p.phone_number).to.eq('(555) 555-1234')
      expect(p.updated_by).to.not.eq(null) // audit field set by the same repository path as the sheet
    })

    // Incomplete number is refused inline; Esc cancels without saving.
    cell(a.authId, 'phone').find('button').click()
    cell(a.authId, 'phone').find('input').clear().type('55{enter}')
    cell(a.authId, 'phone').find('[role="alert"]').should('contain', '10-digit')
    cell(a.authId, 'phone').find('input').type('{esc}')
    cell(a.authId, 'phone').should('contain', '(555) 555-1234')

    // Clearing is allowed.
    cell(a.authId, 'phone').find('button').click()
    cell(a.authId, 'phone').find('input').clear().type('{enter}')
    cy.task('getProfileFields', a.authId).its('phone_number').should('eq', '')
  })

  it('edits name (first and last), requires both, and Tab moves to the next cell', () => {
    cell(b.authId, 'name').find('button').click()
    cell(b.authId, 'name').find('input[aria-label="First name"]').clear().type('{enter}')
    cell(b.authId, 'name').find('[role="alert"]').should('contain', 'required')
    cell(b.authId, 'name').find('input[aria-label="First name"]').type('Abel')
    cell(b.authId, 'name').find('input[aria-label="Last name"]').click().clear().type(`Zzz${stamp}`)
    // Tab out of the last name box saves and opens the next editable cell (email).
    pressTab(cell(b.authId, 'name').find('input[aria-label="Last name"]'))
    cell(b.authId, 'email').find('input').should('be.focused').type('{esc}')
    cy.task('getProfileFields', b.authId).its('first_name').should('eq', 'Abel')
  })

  it('edits employee ID, Tab saves and moves on to Badge ID, Esc cancels', () => {
    const empId = `E${stamp}`
    cell(a.authId, 'employee_id').find('button').click()
    cell(a.authId, 'employee_id').find('input').type(empId)
    pressTab(cell(a.authId, 'employee_id').find('input'))
    cell(a.authId, 'badge_id').find('input').should('be.focused')
    cell(a.authId, 'badge_id').find('input').type('B999{esc}')
    cell(a.authId, 'badge_id').find('input').should('not.exist')
    cell(a.authId, 'employee_id').should('contain', empId)
    cy.task('getProfileFields', a.authId).then((p: any) => {
      expect(p.employee_id).to.eq(empId)
      expect(p.badge_id).to.eq(null)
    })
  })

  it('email edit asks for confirmation first, then goes through Set real email', () => {
    const real = `cy-real-${stamp}@example.com`
    cell(a.authId, 'email').find('button').click()
    cell(a.authId, 'email').find('input').clear().type(`${real}{enter}`)
    cy.contains('Change sign-in email').should('be.visible')
    cy.contains('changes how').should('be.visible')
    cy.contains('button', 'Cancel').click()
    cy.task('getEmailState', a).its('authEmail').should('eq', a.email)

    cell(a.authId, 'email').find('button').click()
    cell(a.authId, 'email').find('input').clear().type(`${real}{enter}`)
    cy.contains('button', 'Change email').click()
    cy.contains(`Email set to ${real}`).should('be.visible')
    cy.task('getEmailState', a).should('deep.eq', { authEmail: real, profileEmail: real, staffEmail: real })
    cy.task('canSignInWithPassword', { email: real, password }).should('eq', false)
  })

  it('the signed-in admin cannot change their own email inline', () => {
    cy.get('input[placeholder^="Search by name"]').clear().type('admin@minutemanfbo.local')
    cy.contains('tr', 'admin@minutemanfbo.local').within(() => {
      cy.get('[data-cell$=":email"]').should('contain', 'admin@minutemanfbo.local')
      cy.get('[data-cell$=":email"] button').should('not.exist')
      cy.get('[data-cell$=":phone"] button').should('exist')
    })
  })

  it('Edit User sheet uses the same phone mask: typing, paste, clearing', () => {
    cy.contains('tr', `Aaa${stamp}`).find('button').last().click()
    cy.contains('[role="menuitem"]', 'Edit').click()
    cy.get('#phoneNumber').type('x(555)5559876zz55')
    cy.get('#phoneNumber').should('have.value', '(555) 555-9876')
    cy.get('#phoneNumber').clear()
    cy.get('#phoneNumber').should('have.value', '')
    cy.get('#phoneNumber').trigger('paste', { clipboardData: { getData: () => '+1 555-555-1111' } })
    cy.get('#phoneNumber').should('have.value', '(555) 555-1111')
    cy.get('#phoneNumber').clear().type('555')
    cy.contains('button', 'Save Changes').click()
    cy.contains('10-digit').should('be.visible')
    cy.get('#phoneNumber').clear().type('5555551111')
    cy.contains('button', 'Save Changes').click()
    cy.contains('User updated').should('be.visible')
    cy.task('getProfileFields', a.authId).its('phone_number').should('eq', '(555) 555-1111')
  })

  it('Settings > Sort users by switches the default Name sort; a header click still overrides it', () => {
    // Zed Aaa / Abe(l) Zzz: by last name Aaa first, by first name Abe(l) first.
    rowNames().then((r) => expect(r[0]).to.contain(`Aaa${stamp}`))

    cy.visit('/settings')
    cy.get('#userNameSort').select('First name (Keith, Leathers)')
    taskUntil<string | null>('getAppSetting', 'user_name_sort', (v) => expect(v).to.eq('first'))

    cy.visit('/users')
    search(stamp)
    cy.get('tbody tr').should('have.length', 2)
    cy.get('th[aria-sort="ascending"]').should('contain', 'Name')
    rowNames().then((r) => expect(r[0]).to.contain(`Zzz${stamp}`))
    cy.get('[data-sort="name"]').click() // override: descending
    rowNames().then((r) => expect(r[0]).to.contain(`Aaa${stamp}`))

    cy.visit('/settings')
    cy.get('#userNameSort').select('Last name (Leathers, Keith)')
    taskUntil<string | null>('getAppSetting', 'user_name_sort', (v) => expect(v).to.eq('last'))
  })
})
