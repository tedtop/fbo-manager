import { taskUntil } from '../../support/task-poll'

// Cypress spec: the airport combobox, mounted as the Settings "Home airport"
// picker (it is not wired into a flight form yet). Needs the airport seed in the local database. Changes
// app_setting home_airport; the global before() in support/e2e.ts resets it to KMSO, and after() puts it back.
const KEY = 'home_airport'

describe('Airport picker (Settings home airport)', () => {
  beforeEach(() => {
    cy.task('setAppSetting', { key: KEY, value: 'KMSO' })
    cy.login()
  })

  after(() => {
    cy.task('resetAppSettings')
  })

  it('GPI lists Glacier Park first and Guapi second; picking Glacier saves KGPI and survives a reload', () => {
    cy.visit('/settings')
    cy.get('#homeAirport').should('contain.text', 'Missoula')

    cy.get('#homeAirport').click()
    cy.get('input[placeholder^="Code or name"]').type('GPI')

    cy.get('[cmdk-item]').filter(':contains("Glacier Park Intl")').should('have.length', 1)
    cy.get('[cmdk-item]').filter(':contains("Guapi")').should('have.length', 1)
    cy.contains('GPI matches more than one airport').should('be.visible')
    cy.get('[cmdk-item]').eq(0).should('contain.text', 'KGPI · FCA · GPI')
    cy.get('[cmdk-item]').eq(1).should('contain.text', 'SKGP · GPI')

    cy.contains('[cmdk-item]', 'Glacier Park Intl').click()
    cy.contains('Settings saved').should('be.visible')

    cy.reload()
    cy.get('#homeAirport').should('contain.text', 'Glacier Park')

    taskUntil<string | null>('getAppSetting', KEY, (value) => expect(value).to.eq('KGPI'))
  })

  it('an unknown strip can be used as typed', () => {
    cy.visit('/settings')
    cy.get('#homeAirport').click()
    cy.get('input[placeholder^="Code or name"]').type('ZZ9X')
    cy.contains('[role="option"]', 'Use "ZZ9X" as typed').click()
    cy.contains('Settings saved').should('be.visible')
    cy.reload()
    cy.get('#homeAirport').should('contain.text', 'ZZ9X')

    taskUntil<string | null>('getAppSetting', KEY, (value) => expect(value).to.eq('ZZ9X'))
  })
})
