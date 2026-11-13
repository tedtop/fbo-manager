// QT airline cards on the Arrivals/Departures board (B93), the wing-loading fuel sheet (B88/B93, MAX wings 8,650 lb),
// and the sheet's truck meter readings with the amber gap note, saved to the truck and shown in the equipment
// detail page's "Meter gaps" section (B87). The QT feed is stubbed with cy.intercept (no QT login, no network).
const STAMP = Date.now().toString(36).toUpperCase()
const TRUCK = `9${STAMP.slice(-3)}`.replace(/[^0-9A-Z]/g, 'X')
const SEED_DATE = '2026-07-14' // the seeded truck sheet ends its front meter at 1,100 and its rear meter at 5,050
const MAX_ID = `CYQT${STAMP}1`
const NG_ID = `CYQT${STAMP}2`

// QT sends local times with no offset, in the airport's zone (the FBO zone setting defaults to America/Denver).
const qtLocal = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(ms))
  const g = (t: string) => p.find((x) => x.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}

const dispatch = (over: Record<string, unknown>) => ({
  AirlineName: 'United Airlines', Origin: 'KDEN', Destination: 'KDEN', FlightStatus: 'Planned',
  Gate: '4', TerminalNumber: '0', MEL: false, ChangeFlags: 0, ...over
})

function stubQt(nowMs: number) {
  const body = {
    Success: true,
    Detail: {
      Dispatches: [
        dispatch({
          TransactionID: MAX_ID, FlightID: MAX_ID, FlightNumber: 'UA1026', TailNumber: 'N17448', AircraftType: 'B38M',
          ArrivalDate: qtLocal(nowMs + 3_600_000), DepartureDate: qtLocal(nowMs + 7_200_000), Quantity: 5891, QuantityInWeight: 40000
        }),
        dispatch({
          TransactionID: NG_ID, FlightID: NG_ID, FlightNumber: 'UA2000', TailNumber: 'N33264', AircraftType: 'B738',
          ArrivalDate: qtLocal(nowMs + 5_400_000), DepartureDate: qtLocal(nowMs + 9_000_000), Quantity: 3000, QuantityInWeight: 20370
        })
      ]
    }
  }
  cy.intercept('GET', '/api/qt/dispatch', { statusCode: 200, body }).as('qt')
  cy.intercept('GET', '/api/qt/flight-track*', { statusCode: 200, body: { tracked: {} } })
}

describe('Airline fuel sheet on the board', () => {
  before(() => {
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: SEED_DATE })
    cy.task('seedTruckWithSheet', { truck: TRUCK, date: SEED_DATE })
  })

  after(() => {
    cy.task('cleanAirlineFueling', MAX_ID)
    cy.task('resetTruckSheetScans', { truck: TRUCK, date: SEED_DATE })
  })

  beforeEach(() => {
    cy.login()
    stubQt(Date.now())
  })

  it('shows airline cards read-only, with the wing-loading summary', () => {
    cy.visit('/')
    cy.wait('@qt')
    cy.contains('[data-testid="qt-callsign"]', 'UA1026').should('be.visible')
    cy.contains('[data-testid="qt-callsign"]', 'UA2000').should('be.visible')
    cy.contains('[data-testid="qt-callsign"]', 'UA1026')
      .closest('[data-slot="card"]')
      .within(() => {
        cy.get('[data-testid="qt-readonly"]').should('contain', 'read-only')
        cy.get('[data-testid="card-edit"]').should('not.exist')
        cy.get('[data-testid="card-delete"]').should('not.exist')
        cy.get('[data-testid="wing-loading"]').should('contain', 'Wing loading').and('contain', 'lbs')
      })
  })

  it('works the fuel sheet for a 737 MAX: wings fill to 8,650 lb (summer) and the rest goes in the center', () => {
    // pin the page's clock to July so the summer wing figure applies whatever day this runs
    cy.clock(Date.UTC(2026, 6, 15, 18, 0), ['Date'])
    stubQt(Date.UTC(2026, 6, 15, 18, 0))
    cy.visit('/')
    cy.wait('@qt')
    cy.contains('[data-testid="qt-callsign"]', 'UA1026').closest('[data-slot="card"]').find('[data-testid="wing-loading"]').as('panel')
    cy.get('@panel').contains('button', 'Fuel sheet').click()
    cy.get('[role="dialog"]').within(() => {
      cy.contains('Fuel sheet: UA1026 N17448').should('be.visible')
      cy.get('select[aria-label="Aircraft fuel type"]').find('option:selected').should('contain', 'B737 MAX')
      cy.get('input[placeholder="8650"]').should('exist') // the Wing max placeholder is the table's summer figure
      cy.contains('tr', 'L Wing').should('contain', '8,650')
      cy.contains('tr', 'R Wing').should('contain', '8,650')
      cy.contains('tr', 'Center').should('contain', '22,700') // 40,000 - 2 x 8,650
      cy.contains('tr', 'Total').should('contain', '40,000')
      cy.contains('Calculated gallons to add').parent().should('contain', '5,891')
      // fuel already in the left wing is not added again
      cy.get('input[aria-label="L Wing before, lbs"]').type('3000')
      cy.contains('tr', 'L Wing').should('contain', '5,650')
      cy.contains('Equals pounds to add').parent().should('contain', '37,000')
    })
  })

  it('refuses a stop below the start and keeps Save off until a truck and meters are given', () => {
    cy.visit('/')
    cy.wait('@qt')
    cy.contains('[data-testid="qt-callsign"]', 'UA1026').closest('[data-slot="card"]').contains('button', 'Fuel sheet').click()
    cy.get('[data-testid="fuel-sheet-meters"]').within(() => {
      cy.contains('button', 'Save fueling').should('be.disabled')
      cy.get('input[aria-label="Front meter start"]').type('500')
      cy.get('input[aria-label="Front meter stop"]').type('400')
      cy.contains('Stop is below start').should('be.visible')
      cy.contains('button', 'Save fueling').should('be.disabled')
    })
  })

  it('saves the fueling to the truck, notes the meter gap in amber, and lists it under Meter gaps', () => {
    cy.visit('/')
    cy.wait('@qt')
    cy.contains('[data-testid="qt-callsign"]', 'UA1026').closest('[data-slot="card"]').contains('button', 'Fuel sheet').click()
    cy.get('[data-testid="fuel-sheet-meters"]').within(() => {
      cy.get('select[aria-label="Fuel truck"]').select(`${TRUCK} E2E Fuel Truck ${TRUCK}`)
      // the front start is prefilled with where the truck's meter last ended
      cy.get('input[aria-label="Front meter start"]').should('have.value', '1100')
      cy.get('[data-testid="meter-start-mismatch"]').should('not.exist')
      cy.get('input[aria-label="Front meter start"]').clear().type('1150')
      cy.get('[data-testid="meter-start-mismatch"]').should('contain', '50 gal not recorded').and('contain', 'last ended at 1,100')
      cy.get('input[aria-label="Front meter stop"]').type('1350')
      cy.get('[data-testid="meter-pumped"]').should('have.text', '200')
      cy.contains('button', 'Save fueling').click()
      cy.contains('Saved to the truck.').should('be.visible')
    })
    cy.task('getAirlineFueling', MAX_ID).then((tx: any) => {
      expect(tx.source).to.eq('qt')
      expect(tx.tail_number).to.eq('N17448')
      expect(Number(tx.quantity_gallons)).to.eq(200)
      expect(Number(tx.quantity_lbs)).to.eq(40000)
      expect(tx.readings).to.have.length(1)
      expect(tx.readings[0]).to.include({ meter: 'front', meter_start: 1150, meter_end: 1350 })
    })

    // the gap is flagged on the truck: 50 gal missing between 1,100 and 1,150
    cy.visit('/equipment')
    cy.get(`[data-testid="equipment-link-${TRUCK}"]`).click()
    cy.get('[data-testid="meter-gaps-section"]').within(() => {
      cy.get('[data-testid="meter-gap-count"]').should('have.text', '1')
      cy.get('[data-testid="meter-last-ends"]').should('contain', '1,350')
      cy.contains('[data-testid^="meter-gap-"]', 'front meter').should('contain', '50 gal missing')
      cy.contains('button', 'Add note').click()
      cy.get('select[aria-label="Reason"]').select(1)
      cy.get('input[aria-label="Note"]').type('Hose swap, not logged')
      cy.contains('button', 'Save and resolve').click()
      cy.get('[data-testid="meter-gap-count"]').should('not.exist')
      cy.contains('No open gaps.').should('be.visible')
    })
  })
})
