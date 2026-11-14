// Hovering a tail number on a board card opens a card with the registry type, registered owner and photo credit
// (adsbdb, FAA as second source). Looked up only on hover, never for the whole board. The lookup route is stubbed.
const stamp = Date.now().toString(36).toUpperCase()
const tailHit = `CH1${stamp}`
const tailMiss = `CH2${stamp}`
const tailErr = `CH3${stamp}`

const hover = (tail: string) => cy.contains('[data-slot="card"] a', tail).focus()

describe('Tail number hover card', () => {
  before(() => {
    for (const [i, tail] of [tailHit, tailMiss, tailErr].entries()) cy.task('seedFlight', { tail, arrivalInMin: 30 + i * 10, departureInMin: 600 })
  })
  after(() => {
    cy.task('cleanFlights', [tailHit, tailMiss, tailErr])
  })
  beforeEach(() => {
    cy.login()
  })

  it('makes no lookup until a tail is hovered, then shows type and owner', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', (req) => {
      const tail = new URL(req.url).searchParams.get('tail')
      req.reply({
        body: { result: { tail, icao24: 'A1', typeIcao: 'C56X', typeDescription: 'Citation Excel', manufacturer: 'Cessna', owner: 'ACME AVIATION LLC', ownerCountry: 'United States', photoUrl: null, photoThumbUrl: null, source: 'adsbdb' } }
      })
    }).as('lookup')
    cy.visit('/')
    cy.contains('[data-slot="card"]', tailHit).should('be.visible')
    cy.get('@lookup.all').should('have.length', 0)
    hover(tailHit)
    cy.wait('@lookup').its('request.url').should('contain', `tail=${tailHit}`)
    cy.contains('Cessna Citation Excel').should('be.visible')
    cy.contains('Registered owner').should('be.visible')
    cy.contains('ACME AVIATION LLC').should('be.visible')
    cy.contains('Click the tail number to track on Flightradar24').should('be.visible')
  })

  it('says so when the registry has no match', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', { body: { result: null } }).as('lookup')
    cy.visit('/')
    hover(tailMiss)
    cy.wait('@lookup')
    cy.contains(`No registry match for ${tailMiss}`).should('be.visible')
  })

  it('says it could not look up the tail when the lookup fails', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', { statusCode: 500, body: { error: 'boom' } }).as('lookup')
    cy.visit('/')
    hover(tailErr)
    cy.wait('@lookup')
    cy.contains(`Could not look up ${tailErr}.`).should('be.visible')
  })

  it('links the tail number to Flightradar24 in a new tab', () => {
    cy.visit('/')
    cy.contains('[data-slot="card"] a', tailHit).should('have.attr', 'href').and('contain', 'flightradar24.com')
    cy.contains('[data-slot="card"] a', tailHit).should('have.attr', 'target', '_blank')
  })
})
