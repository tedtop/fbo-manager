// Fuel Dispatch page (/fuel-dispatch): the QT cards (flight number, tail, gate, status, MEL warning), the Airlines / All
// filter, hiding flights already in the air, QT failing with a login problem, and the wing-loading panel on a card.
// The QT feed, the ADS-B track and the weather are stubbed with cy.intercept (no QT login, no network).
const stamp = Date.now().toString(36).toUpperCase()
const PLANNED = `CYDP${stamp}1`
const INFLIGHT = `CYDP${stamp}2`

const qtLocal = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(ms))
  const g = (t: string) => p.find((x) => x.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}
const base = { AirlineName: 'United Airlines', Origin: 'KDEN', Destination: 'KDEN', Gate: '4', TerminalNumber: '0', ChangeFlags: 0 }

function stub(nowMs: number) {
  cy.intercept('GET', '/api/qt/dispatch', {
    body: {
      Success: true,
      Detail: {
        Dispatches: [
          { ...base, TransactionID: PLANNED, FlightID: PLANNED, FlightNumber: 'UA4401', TailNumber: 'N12345', AircraftType: 'B738', FlightStatus: 'Planned',
            ArrivalDate: qtLocal(nowMs + 3_600_000), DepartureDate: qtLocal(nowMs + 7_200_000), Quantity: 3000, QuantityInWeight: 20370, MEL: true, MELMessage: 'APU inop' },
          { ...base, TransactionID: INFLIGHT, FlightID: INFLIGHT, FlightNumber: 'UA4402', TailNumber: 'N54321', AircraftType: 'B38M', FlightStatus: 'In Flight',
            ArrivalDate: qtLocal(nowMs - 7_200_000), DepartureDate: qtLocal(nowMs - 3_600_000), Quantity: 4000, QuantityInWeight: 27160 }
        ]
      }
    }
  }).as('qt')
  cy.intercept('GET', '/api/qt/flight-track*', { body: { tracked: {} } })
  cy.intercept('GET', '/api/metar*', { body: { success: true, metar: { fltCat: 'VFR', obsTime: Math.floor(nowMs / 1000), visib: 10, clouds: [], dewp: 1, altim: 1019 } } })
  cy.intercept('GET', 'https://api.open-meteo.com/**', {
    body: { current: { temperature_2m: 41, relative_humidity_2m: 60, weather_code: 0, wind_speed_10m: 6, wind_direction_10m: 180 }, daily: { sunrise: ['2026-11-13T07:10'], sunset: ['2026-11-13T16:55'] } }
  })
}

describe('Fuel Dispatch page', () => {
  beforeEach(() => {
    cy.login()
  })

  it('shows QT cards, hides flights already in the air, and reveals them with the filter off', () => {
    stub(Date.now())
    cy.visit('/fuel-dispatch')
    cy.wait('@qt')
    cy.contains('[data-testid="dispatch-card"]', 'UA4401').within(() => {
      cy.contains('N12345').should('be.visible')
      cy.contains('APU inop').should('be.visible')
      cy.get('[data-testid="wing-loading"]').should('exist')
    })
    cy.get('[data-testid="dispatch-card"][data-tail="N54321"]').should('not.exist') // in flight: hidden by default
    cy.get('[data-testid="density-box"]').should('be.visible')
    cy.get('[data-testid="weather-widget"]').should('contain', '41°F').and('contain', 'VFR')

    // "Hide departed flights" off: the flight in the air shows
    cy.get('#hideDepartedToggle').parent().click()
    cy.get('[data-testid="dispatch-card"][data-tail="N54321"]').should('exist')
    // Airlines / All view: All adds the fuel order cards and keeps the QT cards
    cy.contains('[data-testid="dispatch-filters"] button', 'All').click()
    cy.contains('[data-testid="dispatch-card"]', 'UA4401').should('exist')
  })

  it('opens the fuel sheet from a card with the planned gate fuel', () => {
    stub(Date.now())
    cy.visit('/fuel-dispatch')
    cy.wait('@qt')
    cy.contains('[data-testid="dispatch-card"]', 'UA4401').contains('button', 'Fuel sheet').click()
    cy.get('[role="dialog"]').within(() => {
      cy.contains('Fuel sheet').should('be.visible')
      cy.contains('Planned gate fuel').parent().should('contain', '20,370')
    })
  })

  it('says QT could not be reached when its login fails, instead of showing a blank page', () => {
    cy.intercept('GET', '/api/qt/dispatch', { statusCode: 502, body: { error: 'QT rejected the login', diagnostics: { stage: 'login_failed' } } }).as('qt')
    cy.intercept('GET', '/api/qt/flight-track*', { body: { tracked: {} } })
    cy.visit('/fuel-dispatch')
    cy.wait('@qt')
    cy.get('[data-testid="dispatch-card"]').should('not.exist')
    cy.contains('QT login is being rejected').should('be.visible')
    cy.get('[data-testid="dispatch-status"]').should('contain', 'Dispatch error')
  })
})
