// Port of e2e/flight-create.e2e.ts (Playwright) plus departure-only, validation and cancel (BACKLOG B08d).
// KNOWN BUG / NOT YET tags pin today's behavior; each flips when the matching backlog item lands:
//   F1 arrival-only gets a fabricated departure (B09/B10), F2 times stored as UTC wall-clock (B09/B10),
//   NOT YET: alert() validation instead of toasts (B11), QT checkbox (B09b), hangar pull preset (B24).
// Assertions on stored instants are computed with the browser's own Date, so they hold in any timezone.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailNew = `CC1${stamp}` // does not exist: the form must create the aircraft
const tailTurn = `CC2${stamp}` // existing aircraft, quick turn
const tailDep = `CC3${stamp}` // existing aircraft, departure only
const tailCancel = `CC4${stamp}` // typed then cancelled: nothing may be created
const tails = [tailNew, tailTurn, tailDep, tailCancel]

let date: string // the sheet's default date (today), read from the form

const TAIL_PLACEHOLDER = 'e.g., N12345'

const openAddFlightSheet = () => {
  cy.login()
  cy.visit('/')
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}

const pickAircraftType = (search: string, optionName: RegExp) => {
  cy.get('#aircraftType').click()
  cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type(search)
  cy.contains('[role="option"]', optionName).click()
}

const pickType = (current: string, option: string) => {
  cy.contains('[role="combobox"]', current).click()
  cy.contains('[role="option"]', option).click()
}

const submit = () => {
  cy.get('[role="dialog"]').contains('button', 'Add Flight').click()
}

// Instant (ISO, UTC) the browser would produce for a local wall-clock string.
const localIso = (wallClock: string, plusMin = 0) =>
  cy.window().then((win) => {
    const d = new win.Date(wallClock)
    d.setMinutes(d.getMinutes() + plusMin)
    return d.toISOString()
  })

describe('Add Flight sheet persists real rows', () => {
  before(() => {
    cy.task('seedAircraft', tailTurn)
    cy.task('seedAircraft', tailDep)
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  // A clean create must not raise alert() (validation / swallowed failures).
  const failOnAlert = () =>
    cy.on('window:alert', (msg) => {
      throw new Error(`Unexpected alert: ${msg}`)
    })

  it('arrival with a NEW tail number creates the aircraft (GLF6) and the flight', () => {
    failOnAlert()
    openAddFlightSheet()
    cy.get('#date').invoke('val').then((v) => {
      date = v as string
    })

    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailNew)
    pickAircraftType('glf6', /G650/)
    cy.get('#arrivalTime').type('14:30')
    cy.get('#origin').type('KTEB')
    cy.get('#destination').type('KASE')
    cy.get('#fuel').click()
    cy.get('#catering').click()
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getAircraft', tailNew).should('have.property', 'aircraft_type_icao', 'GLF6')
    cy.task('getFlightByTail', tailNew).then((flight: FlightRow) => {
      expect(flight.origin).to.eq('KTEB')
      expect(flight.destination).to.eq('KASE')
      expect(flight.flight_status).to.eq('scheduled')
      expect([...(flight.services ?? [])].sort()).to.deep.eq(['catering', 'fuel'])
      // (date read from the sheet)
        // KNOWN BUG F2: flips when B09/B10 land - times are sent with no timezone offset, so Postgres
        // stores the wall-clock value as UTC. Once fixed this must equal the local 14:30 instant.
        expect(new Date(flight.arrival_time).toISOString()).to.eq(`${date}T14:30:00.000Z`)
        // KNOWN BUG F1: flips when B09/B10 land - an arrival-only entry gets a fabricated departure
        // (arrival + 45 min, converted via toISOString), so the row has both times (quick turn).
        localIso(`${date}T14:30:00`, 45).then((iso) => {
          expect(new Date(flight.departure_time).toISOString().slice(0, 16)).to.eq(iso.slice(0, 16))
        })
    })

    cy.contains(tailNew, { timeout: 15_000 }).should('be.visible')
    // KNOWN BUG F1: shows in both columns (quick turn) instead of Arrivals only.
    cy.get('body').should(($b) => {
      expect($b.find(`:contains("${tailNew}")`).filter((_, el) => el.children.length === 0)).to.have.length(2)
    })
  })

  it('quick turn on an existing aircraft with arrival and departure times', () => {
    failOnAlert()
    openAddFlightSheet()
    cy.get('#date').invoke('val').then((v) => {
      date = v as string
    })

    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailTurn)
    pickAircraftType('b738', /B738/)
    pickType('Arrival', 'Quick Turn') // departure time is disabled for plain arrivals
    cy.get('#arrivalTime').type('09:00')
    cy.get('#departureTime').type('11:20')
    cy.get('#origin').type('KBOS')
    cy.get('#destination').type('KMIA')
    cy.get('#hangar').click()
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailTurn).then((flight: FlightRow) => {
      expect(flight.origin).to.eq('KBOS')
      expect(flight.destination).to.eq('KMIA')
      expect(flight.services).to.deep.eq(['hangar'])
      // (date read from the sheet)
        // KNOWN BUG F2: stored as UTC wall-clock, no offset applied.
        expect(new Date(flight.arrival_time).toISOString()).to.eq(`${date}T09:00:00.000Z`)
        expect(new Date(flight.departure_time).toISOString()).to.eq(`${date}T11:20:00.000Z`)
    })
    // NOT YET (B09b): there is no "QT" checkbox; a quick turn is just type + both times today.
    cy.task('getAircraft', tailTurn).should('have.property', 'aircraft_type_icao', 'B738')
    cy.contains(tailTurn, { timeout: 15_000 }).should('be.visible')
  })

  it('departure-only entry stores a NULL arrival', () => {
    failOnAlert()
    openAddFlightSheet()
    cy.get('#date').invoke('val').then((v) => {
      date = v as string
    })

    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailDep)
    pickAircraftType('b738', /B738/)
    pickType('Arrival', 'Departure')
    cy.get('#departureTime').type('16:45')
    cy.get('#origin').type('KPBI')
    cy.get('#destination').type('KTEB')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailDep).then((flight: FlightRow) => {
      expect(flight.arrival_time).to.eq(null)
      expect(flight.origin).to.eq('KPBI')
      // (date read from the sheet)
        // KNOWN BUG F2: UTC wall-clock again.
        expect(new Date(flight.departure_time).toISOString()).to.eq(`${date}T16:45:00.000Z`)
    })
    cy.contains(tailDep, { timeout: 15_000 }).should('be.visible')
    // NOT YET (B24): no "hangar pull" preset; a departure-only entry is built by hand like this.
  })

  it('submitting with no time is blocked by native validation and creates nothing', () => {
    const alertStub = cy.stub().as('alert')
    cy.on('window:alert', alertStub)
    openAddFlightSheet()
    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailCancel)
    pickAircraftType('b738', /B738/)
    submit()
    // Arrival type makes #arrivalTime required, so the browser blocks the submit before the
    // handler's own alert('Please provide at least one time') can ever run (that branch is dead code).
    cy.contains('h2', 'Add New Flight').should('be.visible')
    cy.get('#arrivalTime:invalid').should('exist')
    cy.get('@alert').should('not.have.been.called')
    cy.task('getFlightByTail', tailCancel).should('eq', null)
  })

  it('submitting with no aircraft type shows a browser alert and creates nothing', () => {
    const alertStub = cy.stub().as('alert')
    cy.on('window:alert', alertStub)
    openAddFlightSheet()
    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailCancel)
    cy.get('#arrivalTime').type('10:00')
    submit()
    // NOT YET (B11): validation is a window.alert(), not an inline error/toast. Flips when B11 lands.
    cy.get('@alert').should('have.been.calledWith', 'Please select an aircraft type')
    cy.contains('h2', 'Add New Flight').should('be.visible')
    cy.task('getFlightByTail', tailCancel).should('eq', null)
  })

  it('cancelling the sheet creates no flight or aircraft', () => {
    openAddFlightSheet()
    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailCancel)
    cy.get('[role="dialog"]').contains('button', 'Cancel').click()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    cy.task('getFlightByTail', tailCancel).should('eq', null)
    cy.task('getAircraft', tailCancel).should('eq', null)
  })
})
