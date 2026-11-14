import { taskUntil } from '../../support/task-poll'

// Cypress spec. Changes app_setting
// tail_number_prefix; the global before() in support/e2e.ts resets it to N, and after() puts it back.
const KEY = 'tail_number_prefix'

const setPrefixInDb = (value: string) => cy.task('setAppSetting', { key: KEY, value })
const tailInput = () => cy.get('input[placeholder="e.g., N12345"]')
// The Settings page has more than one form with a Save button; scope to the tail prefix form.
const tailPrefixForm = () => cy.get('#tailPrefix').closest('form')

// The Add Flight form reads its prefill from the app_setting query. Opening the sheet in the same instant the page
// loads races that query (the prefix can arrive after the sheet opened and the tail field is then not reliably
// focused / swapped), so wait for the settings response first: what a person does, a beat after load.
const openAddFlight = () => {
  cy.intercept('GET', '**/rest/v1/app_setting*').as('appSettings')
  cy.visit('/')
  cy.wait('@appSettings')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}

describe('Tail number prefix (Settings)', () => {
  beforeEach(() => {
    setPrefixInDb('N')
    cy.login()
  })

  after(() => {
    cy.task('resetAppSettings')
  })

  it('a new flight starts with N in the tail field and typing continues after it', () => {
    openAddFlight()
    tailInput().should('have.value', 'N')
    // No click: the tail field has the focus (B103: it is disabled while aircraft load, and takes the focus when
    // enabled), with the caret after the prefix.
    tailInput().should('be.focused')
    cy.focused().type('868cb')
    tailInput().should('have.value', 'N868CB')
  })

  it('the suggestion list stays closed until something is typed after the prefix', () => {
    openAddFlight()
    tailInput().should('have.value', 'N')
    cy.get('div.absolute.z-50').should('not.exist')
  })

  it('saving with only the prefix shows an inline message and creates nothing', () => {
    openAddFlight()
    cy.get('#arrivalTime').type('10:00')
    cy.get('[role="dialog"]').contains('button', /^Add Flight$/).click()
    cy.contains('Enter the tail number').should('be.visible')
    cy.contains('h2', 'Add New Flight').should('be.visible')
    // Nothing was created: no flight exists for the bare prefix.
    cy.task('getFlightByTail', 'N').should('eq', null)
  })

  it('changing the prefix in Settings changes the prefill (C-)', () => {
    cy.visit('/settings')
    cy.contains('h1, h2', 'Settings').should('be.visible')
    cy.get('#tailPrefix').should('have.value', 'N')

    cy.contains('button', /^C-/).click()
    cy.get('#tailPrefix').should('have.value', 'C-')
    tailPrefixForm().contains('button', /^Save$/).click()
    cy.contains('Settings saved').should('be.visible')

    // The persisted value, read straight from the database.
    taskUntil<string | null>('getAppSetting', KEY, (value) => expect(value).to.eq('C-'))

    openAddFlight()
    tailInput().should('have.value', 'C-')
  })

  it('an invalid prefix is rejected inline and cannot be saved', () => {
    cy.visit('/settings')
    cy.get('#tailPrefix').clear().type('N 1')
    cy.get('#tailPrefixError').invoke('text').should('match', /letters, numbers and hyphens/i)
    tailPrefixForm().contains('button', /^Save$/).should('be.disabled')
    // Nothing reached the database.
    cy.task('getAppSetting', KEY).should('eq', 'N')
  })

  it('an empty prefix means no prefill', () => {
    setPrefixInDb('')
    openAddFlight()
    tailInput().should('have.value', '')
  })
})
