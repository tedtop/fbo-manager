// Fuel Farm dashboard: a tank card shows its level, gallons, percent and ullage; typing a new level (inches, or feet
// and inches) and pressing Update writes a reading and the card follows; limits are enforced. Own tank CYFF.
import { inchesToGallons } from '../../../lib/gallons-tables'

const TANK = 'CYFF' // capacity 12,000 gal, usable 14"-93", physical 1"-114" (see seedTankWithReadings); uses the T1-T6 gallon table
const gal = (inches: number) => inchesToGallons(TANK, inches).toLocaleString()
const card = () => cy.get(`[data-testid="tank-${TANK}"]`)
const update = (text: string) => {
  cy.get(`[data-testid="level-input-${TANK}"]`).clear().type(text)
  cy.get(`[data-testid="level-update-${TANK}"]`).click()
}

describe('Fuel Farm: tank cards and level updates', () => {
  before(() => {
    cy.task('cleanTank', TANK)
    cy.task('seedTankWithReadings', {
      tankId: TANK,
      readings: [
        { level: 60, recordedAt: '2026-11-10T12:00:00Z' },
        { level: 40, recordedAt: '2026-11-11T12:00:00Z' }
      ]
    })
  })
  after(() => {
    cy.task('cleanTank', TANK)
  })
  beforeEach(() => {
    cy.login()
    cy.visit('/fuel-farm')
    card().should('be.visible')
  })

  it('shows the newest reading with gallons, percent full and ullage to the usable line', () => {
    card().within(() => {
      cy.get('.current-level').should('have.text', '40"')
      cy.get('.level-gallons').should('contain', `${gal(40)} gal`)
      cy.get('.level-percentage').should('contain', `${Math.round((40 / 93) * 100)}% full`)
      cy.get('.level-ullage').should('contain', `Ullage: ${(inchesToGallons(TANK, 93) - inchesToGallons(TANK, 40)).toLocaleString()} gal to 93"`)
      // no recorded low for this tank (that is a separate record, see tank-lowest-level.cy.ts): no unusable heel shown
      cy.get('.level-usable').should('not.exist')
    })
  })

  it('records a new level and the card follows, newest reading first in the database', () => {
    update('55')
    cy.contains(`${TANK} updated to 55"`).should('be.visible')
    card().find('.current-level').should('have.text', '55"')
    card().find('.level-gallons').should('contain', `${gal(55)} gal`)
    cy.task('getTankReadings', TANK).should((rows: any) => {
      expect(rows[0].level).to.eq(55)
      expect(rows).to.have.length(3)
    })
  })

  it('reads feet and inches (4\'6" is 54")', () => {
    update('4\'6"')
    cy.contains(`${TANK} updated to 54"`).should('be.visible')
    card().find('.current-level').should('have.text', '54"')
  })

  it('shows an overfill at its real level, past the usable line', () => {
    update('100')
    card().find('.current-level').should('have.text', '100"')
    card().find('.level-percentage').should('contain', 'over 93"')
    card().find('.level-ullage').should('contain', 'gal over the line')
  })

  it('refuses a level above the physical limit or below the minimum, writing nothing', () => {
    cy.task('getTankReadings', TANK).then((before: any) => {
      update('200')
      cy.contains(`${TANK} cannot exceed 114" (physical tank limit)`).should('be.visible')
      update('0.5')
      cy.contains(`${TANK} must be at least 1"`).should('be.visible')
      update('abc') // letters are stripped as typed, leaving an empty Update that fills in the current level instead of saving
      cy.task('getTankReadings', TANK).should('have.length', before.length)
    })
  })

  it('fills the field with the current level when Update is pressed empty', () => {
    cy.get(`[data-testid="level-update-${TANK}"]`).click()
    cy.get(`[data-testid="level-input-${TANK}"]`).invoke('val').should('match', /^\d/)
  })
})
