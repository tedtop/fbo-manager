// Picking an existing aircraft whose type is still Unknown retries the registry lookup and saves the result.
const stamp = Date.now().toString(36).toUpperCase()
const tailHit = `CR1${stamp}`
const tailMiss = `CR2${stamp}`

describe('Add Flight retries the type lookup for Unknown aircraft', () => {
  before(() => {
    cy.task('seedUnknownAircraft', tailHit)
    cy.task('seedUnknownAircraft', tailMiss)
  })
  after(() => {
    cy.task('cleanFlights', [tailHit, tailMiss])
  })

  const openSheet = () => {
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
  }
  const pickTail = (tail: string) => {
    cy.get('input[placeholder="e.g., N12345"]').clear().type(tail)
    cy.contains('[role="option"]', tail).click()
  }

  it('fills the type from the registry when it knows the tail', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', {
      body: { result: { tail: tailHit, typeIcao: 'C172', typeDescription: 'CESSNA 172', manufacturer: 'Cessna' } }
    }).as('lookup')
    openSheet()
    pickTail(tailHit)
    cy.wait('@lookup')
    cy.get('#aircraftType').should('contain.text', '172')
  })

  it('says so when the registry has no match', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', { body: { result: null } }).as('lookup')
    openSheet()
    pickTail(tailMiss)
    cy.wait('@lookup')
    cy.contains(`No registry match for ${tailMiss}`).should('be.visible')
  })
})
