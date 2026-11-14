// B79: end-to-end proof of the tail-number type lookup (B60, FAA second source B86) and the hover card.
// The app's own /api/aircraft/lookup route is the only thing the browser calls, and it is stubbed in every test, so
// adsbdb, the FAA registry, airport-data.com photos and Flightradar24 are never reached. Complements
// aircraft-faa-lookup / aircraft-type-retry / aircraft-hover with the pieces they do not assert: the spinner while the
// lookup is in flight, the manual pick after a miss, the photo in the hover card and the exact Flightradar24 link.
const stamp = Date.now().toString(36).toUpperCase()
const tailNew = `CL1${stamp}`
const tailMiss = `CL2${stamp}`
const tailUnknown = `CL3${stamp}`
const tailHover = `CL4${stamp}`
const tails = [tailNew, tailMiss, tailUnknown, tailHover]

// 1x1 PNG as a data: URI for the stubbed photo, so no photo host is contacted.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// The save follows the form fill asynchronously and cy.task is not retried, so poll the row.
const waitForType = (tail: string, icao: string, tries = 20): void => {
  cy.task('getAircraft', tail).then((a: any) => {
    if (a?.aircraft_type_icao === icao || tries <= 0) {
      expect(a?.aircraft_type_icao).to.eq(icao)
      return
    }
    cy.wait(250)
    waitForType(tail, icao, tries - 1)
  })
}

const openSheet = () => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}
const tailInput = () => cy.get('input[placeholder="e.g., N12345"]')

describe('Tail number type lookup and hover card (B79)', () => {
  before(() => {
    cy.task('seedUnknownAircraft', tailUnknown)
    cy.task('seedFlight', { tail: tailHover, arrivalInMin: 30, departureInMin: 600 })
  })
  after(() => {
    cy.task('cleanFlights', tails)
  })
  beforeEach(() => {
    // Safety net: anything that is not the app's own origin must never be reached by a test in this file.
    cy.intercept({ url: /^https?:\/\/(?!localhost|127\.0\.0\.1)(.*(adsbdb|faa\.gov|airport-data|flightradar24))/ }, (req) => {
      throw new Error(`B79 test reached a real external host: ${req.url}`)
    })
  })

  it('shows the spinner while looking up a new aircraft, then fills and saves the type', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', {
      delay: 1200,
      body: { result: { tail: tailNew, icao24: 'A1', typeIcao: 'C172', typeDescription: 'Skyhawk', manufacturer: 'Cessna', owner: 'X', ownerCountry: 'United States', photoUrl: null, photoThumbUrl: null, source: 'adsbdb' } }
    }).as('lookup')
    openSheet()
    tailInput().clear().type(tailNew)
    cy.contains('button', `Add new aircraft: ${tailNew}`).click()
    cy.get('[aria-label="Looking up aircraft type"]').should('exist')
    cy.get('#aircraftType').should('have.attr', 'aria-busy', 'true')
    cy.wait('@lookup').its('request.url').should('contain', `tail=${tailNew}`)
    cy.get('[aria-label="Looking up aircraft type"]').should('not.exist')
    cy.get('#aircraftType').should('contain.text', 'C172')
    cy.contains('No registry match').should('not.exist')
    waitForType(tailNew, 'C172')
  })

  it('on a miss shows the hint and lets the user pick a type by hand', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', { body: { result: null } }).as('lookup')
    openSheet()
    tailInput().clear().type(tailMiss)
    cy.contains('button', `Add new aircraft: ${tailMiss}`).click()
    cy.wait('@lookup')
    cy.contains(`No registry match for ${tailMiss}`).should('be.visible')
    cy.get('#aircraftType').should('not.be.disabled').click()
    cy.get('input[placeholder^="Search code or model"]').type('C172')
    cy.contains('[cmdk-item]', 'C172').click()
    cy.get('#aircraftType').should('contain.text', 'C172')
    cy.get('#typeError').should('not.exist')
  })

  it('retries an existing Unknown-type aircraft and saves the result', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', {
      body: { result: { tail: tailUnknown, typeIcao: 'C56X', typeDescription: 'Citation Excel', manufacturer: 'Cessna' } }
    }).as('lookup')
    openSheet()
    tailInput().clear().type(tailUnknown)
    cy.contains('button', tailUnknown).click()
    cy.wait('@lookup').its('request.url').should('contain', `tail=${tailUnknown}`)
    cy.get('#aircraftType').should('contain.text', 'C56X')
    waitForType(tailUnknown, 'C56X')
  })

  it('hover card shows photo, type and owner, and the tail links to Flightradar24', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', {
      body: { result: { tail: tailHover, icao24: 'A1', typeIcao: 'C56X', typeDescription: 'Citation Excel', manufacturer: 'Cessna', owner: 'ACME AVIATION LLC', ownerCountry: 'United States', photoUrl: PIXEL, photoThumbUrl: null, source: 'adsbdb' } }
    }).as('lookup')
    cy.login()
    cy.visit('/')
    cy.contains('[data-slot="card"] a', tailHover).as('tail').focus()
    cy.wait('@lookup')
    cy.get(`img[alt="${tailHover} aircraft"]`).should('have.attr', 'src', PIXEL)
    cy.contains('Photo: airport-data.com').should('be.visible')
    cy.contains('Cessna Citation Excel').should('be.visible')
    cy.contains('ACME AVIATION LLC').should('be.visible')
    // The click opens Flightradar24 in a new tab; assert the link instead of navigating away.
    cy.get('@tail')
      .should('have.attr', 'href', `https://www.flightradar24.com/data/aircraft/${tailHover.toLowerCase()}`)
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener noreferrer')
  })
})
