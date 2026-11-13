// B86: a US tail adsbdb does not know is answered by the FAA registry (server side, /api/aircraft/lookup, result.source 'faa').
// The route is stubbed here (no adsbdb or FAA call); the proof is that the browser applies the FAA make/model, saves the
// type on the new aircraft row, never stores the registered owner, and shows "No registry match" when the FAA has none.
const stamp = Date.now().toString(36).toUpperCase()
const tailFaa = `CF1${stamp}`
const tailNone = `CF2${stamp}`

const openSheet = () => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}
const addNewAircraft = (tail: string) => {
  cy.get('input[placeholder="e.g., N12345"]').clear().type(tail)
  cy.contains('button', `Add new aircraft: ${tail}`).click()
}

describe('Aircraft type lookup, FAA registry as second source (B86)', () => {
  after(() => {
    cy.task('cleanFlights', [tailFaa, tailNone])
  })

  it('fills and saves the type from an FAA answer, and keeps the owner out of the database', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', {
      body: {
        result: {
          tail: tailFaa, icao24: 'A12345', typeIcao: 'C56X', typeDescription: '560XL', manufacturer: 'CESSNA',
          owner: 'SECRET OWNER LLC', ownerCountry: 'United States', photoUrl: null, photoThumbUrl: null, source: 'faa'
        }
      }
    }).as('lookup')
    openSheet()
    addNewAircraft(tailFaa)
    cy.wait('@lookup').its('request.url').should('contain', `tail=${tailFaa}`)
    cy.get('#aircraftType').should('contain.text', 'Citation Excel')
    // the type is written to the aircraft row (what the next Add Flight and the board will show)
    cy.task('getAircraft', tailFaa).should((a: any) => {
      expect(a.aircraft_type_icao).to.eq('C56X')
    })
    cy.task('getAircraft', tailFaa).then((a) => {
      expect(JSON.stringify(a)).not.to.contain('SECRET OWNER')
    })
  })

  it('says so when neither registry knows the tail', () => {
    cy.intercept('GET', '/api/aircraft/lookup*', { body: { result: null } }).as('lookup')
    openSheet()
    addNewAircraft(tailNone)
    cy.wait('@lookup')
    cy.contains(`No registry match for ${tailNone}`).should('be.visible')
    cy.task('getAircraft', tailNone).should((a: any) => {
      expect(a.aircraft_type_icao).to.eq('UNKN')
    })
  })
})
