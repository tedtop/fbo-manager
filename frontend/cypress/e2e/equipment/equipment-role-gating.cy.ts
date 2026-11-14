// B85a: a user with Equipment access but no Truck sheets access (the Front Desk role) still gets the equipment pages,
// but never the truck-sheet data on them: the meter readings, the meter gaps and the links into the sheets. An
// administrator, who holds both, sees them on the same truck.
const TRUCK = '9943'
const DATE = '2026-07-15'
const stamp = Date.now().toString(36)
const email = `cy-frontdesk-${stamp}@example.com`
const password = `pw-${stamp}`
let userId: string | null = null

const loginAsFrontDesk = () =>
  cy.session(
    `frontdesk-${stamp}`,
    () => {
      cy.visit('/login')
      cy.get('#email').type(email)
      cy.get('#password').type(password, { log: false })
      cy.contains('button', /^Sign In$/).click()
      cy.location('pathname', { timeout: 15_000 }).should('eq', '/')
    },
    {
      validate() {
        cy.getCookies().should('not.be.empty')
      },
    }
  )

describe('Equipment pages without Truck sheets access', () => {
  before(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE })
    cy.task('seedTruckWithSheet', { truck: TRUCK, date: DATE, withScan: false })
    cy.task('createUserWithRole', { email, password, role: 'Front Desk' }).then((id) => {
      userId = id as string
    })
  })

  after(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: DATE }) // also deletes the truck
    if (userId) cy.task('deleteAuthUser', userId)
  })

  it('happy path: the list and the truck page work, with maintenance and notes, and no truck-sheet data', () => {
    loginAsFrontDesk()
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
    cy.url().should('match', /\/equipment\/\d+$/)
    cy.contains('h1', `E2E Fuel Truck ${TRUCK}`).should('be.visible')
    cy.get('[data-testid="maintenance-section"]').should('be.visible')

    // the page is fully rendered (the maintenance section is last-but-two); truck-sheet sections are simply absent
    cy.get('[data-testid="readings-section"]').should('not.exist')
    cy.get('[data-testid="meter-gaps-section"]').should('not.exist')
    cy.get(`[data-testid="truck-day-${DATE}"]`).should('not.exist')
    cy.get('[data-testid^="scan-thumb"]').should('not.exist')
    cy.get('a[href^="/truck-sheets/"]').should('not.exist')
  })

  it('denied: the sheet data stays hidden after a reload, while an administrator sees it on the same truck', () => {
    loginAsFrontDesk()
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
    cy.get('[data-testid="maintenance-section"]').should('be.visible')
    cy.reload()
    cy.get('[data-testid="maintenance-section"]').should('be.visible')
    cy.contains('1,000 → 1,100').should('not.exist')
    cy.get(`[data-testid="truck-day-${DATE}"]`).should('not.exist')

    // control: the same page for an administrator does show the sheet, so the checks above can fail
    cy.login('admin')
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
    cy.get(`[data-testid="truck-day-${DATE}"]`).should('be.visible')
    cy.get('a[href^="/truck-sheets/"]').should('exist')
  })
})
