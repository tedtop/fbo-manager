// Settings beyond the tail prefix and home airport: FBO time zone, name display, Manage Users sort, equipment types.
// Each saves to app_setting (read straight from the database); every key is deleted afterwards so the app is back on its defaults.
const KEYS = ['timezone', 'name_display', 'user_name_sort', 'equipment_types']
const resetKeys = () => KEYS.forEach((key) => cy.task('setAppSetting', { key, value: null }))

describe('Settings: time zone, names, equipment types', () => {
  before(resetKeys)
  after(resetKeys)
  beforeEach(() => {
    cy.login()
    cy.visit('/settings')
    cy.contains('h1, h2', 'Settings').should('be.visible')
  })

  it('saves the FBO time zone as soon as it changes and previews the time there', () => {
    cy.get('#timeZone').select('America/New_York')
    cy.contains('Board time zone is America/New_York.').should('be.visible')
    cy.task('getAppSetting', 'timezone').should('eq', 'America/New_York')
    cy.get('[data-testid="timezone-preview"]').should('contain', '(America/New_York)')
    cy.reload()
    cy.get('#timeZone').should('have.value', 'America/New_York')
  })

  it('saves how names are shown and how Manage Users sorts', () => {
    cy.get('#nameDisplay').select('first_last')
    cy.get('#userNameSort').select('first')
    cy.get('#nameDisplay').should('have.value', 'first_last')
    cy.get('#userNameSort').should('have.value', 'first')
    // Both saves are asynchronous: reload until the stored values show, then read the DB as the proof.
    cy.reload()
    cy.get('#nameDisplay').should('have.value', 'first_last')
    cy.get('#userNameSort').should('have.value', 'first')
    cy.task('getAppSetting', 'name_display').should('eq', 'first_last')
    cy.task('getAppSetting', 'user_name_sort').should('eq', 'first')
  })

  it('adds an equipment type, which the Equipment page then offers, and refuses an empty name', () => {
    const label = `Cy Cart ${Date.now().toString(36)}`
    cy.contains('button', 'Add type').click()
    cy.contains('form', 'Equipment types').within(() => {
      cy.contains('button', /^Save$/).should('be.disabled') // the new row has no name yet
      cy.get('input[aria-label="Type name"]').last().type(label)
      cy.get('input[aria-label^="Icon for"]').last().type('🛒')
      cy.contains('button', /^Save$/).should('not.be.disabled').click()
    })
    cy.contains('Equipment types saved').should('be.visible')
    cy.task('getAppSetting', 'equipment_types').should((value: any) => {
      expect(JSON.stringify(value)).to.contain(label)
    })

    cy.visit('/equipment')
    cy.contains('button', 'Add Equipment').click()
    cy.get('[role="dialog"] [role="combobox"]').first().click()
    cy.contains('[role="option"]', label).should('exist')
  })

  it('keeps Fuel Truck: it cannot be removed', () => {
    cy.contains('form', 'Equipment types').find('button[aria-label="Remove Fuel Truck"]').should('be.disabled')
  })
})
