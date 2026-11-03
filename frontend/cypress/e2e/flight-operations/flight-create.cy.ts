// Port of e2e/flight-create.e2e.ts (Playwright) plus departure-only, validation and cancel (BACKLOG B08d).
// KNOWN BUG / NOT YET tags pin today's behavior; each flips when the matching backlog item lands:
//   F2 times stored as UTC wall-clock (B10),
//   NOT YET: alert() for the aircraft-type validation instead of toasts (B11), hangar pull preset (B24).
// B09b: QT checkbox (preselected, departure = arrival + 1 h), optional scheduled times, actual times.
// Assertions on stored instants are computed with the browser's own Date, so they hold in any timezone.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailNew = `CC1${stamp}` // does not exist: the form must create the aircraft
const tailTurn = `CC2${stamp}` // existing aircraft, quick turn
const tailDep = `CC3${stamp}` // existing aircraft, departure only
const tailCancel = `CC4${stamp}` // typed then cancelled: nothing may be created
const tailArr = `CC5${stamp}` // existing aircraft, arrival only (return)
const tailActual = `CC6${stamp}` // existing aircraft, scheduled + actual times
const tails = [tailNew, tailTurn, tailDep, tailCancel, tailArr, tailActual]

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
    cy.task('seedAircraft', tailArr)
    cy.task('seedAircraft', tailActual)
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
        // KNOWN BUG F2: flips when B10 lands - times are sent with no timezone offset, so Postgres
        // stores the wall-clock value as UTC. Once fixed this must equal the local 14:30 instant.
        expect(new Date(flight.scheduled_arrival_time).toISOString()).to.eq(`${date}T14:30:00.000Z`)
        // QT is preselected: departure = arrival + 1 h (F1: no more fabricated +45 min).
        expect(new Date(flight.scheduled_departure_time).toISOString()).to.eq(`${date}T15:30:00.000Z`)
        expect(flight.is_quick_turn).to.eq(true)
    })

    cy.contains(tailNew, { timeout: 15_000 }).should('be.visible')
    // A quick turn shows in both columns.
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
    cy.get('#arrivalTime').type('09:00')
    cy.get('#departureTime').should('have.value', '10:00') // QT: arrival + 1 h
    cy.get('#departureTime').type('11:20')
    cy.get('#quickTurn').should('have.attr', 'aria-checked', 'false') // editing departure unchecks QT
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
        expect(new Date(flight.scheduled_arrival_time).toISOString()).to.eq(`${date}T09:00:00.000Z`)
        expect(new Date(flight.scheduled_departure_time).toISOString()).to.eq(`${date}T11:20:00.000Z`)
        expect(flight.is_quick_turn).to.eq(false)
    })
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
    cy.get('#departureTime').type('16:45') // QT is preselected; typing a departure unchecks it
    cy.get('#quickTurn').should('have.attr', 'aria-checked', 'false')
    cy.get('#origin').type('KPBI')
    cy.get('#destination').type('KTEB')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailDep).then((flight: FlightRow) => {
      expect(flight.scheduled_arrival_time).to.eq(null)
      expect(flight.is_quick_turn).to.eq(false)
      expect(flight.origin).to.eq('KPBI')
      // (date read from the sheet)
        // KNOWN BUG F2: UTC wall-clock again.
        expect(new Date(flight.scheduled_departure_time).toISOString()).to.eq(`${date}T16:45:00.000Z`)
    })
    cy.contains(tailDep, { timeout: 15_000 }).should('be.visible')
    cy.get('body').should(($b) => {
      expect($b.find(`:contains("${tailDep}")`).filter((_, el) => el.children.length === 0)).to.have.length(1)
    })
    // NOT YET (B24): no "hangar pull" preset; a departure-only entry is built by hand like this.
  })

  it('arrival-only entry (return) stores a NULL departure and shows only in Arrivals', () => {
    failOnAlert()
    openAddFlightSheet()
    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailArr)
    pickAircraftType('b738', /B738/)
    cy.get('#arrivalTime').type('13:10')
    cy.get('#departureTime').should('have.value', '14:10')
    cy.get('#departureTime').clear() // blank the computed departure: a return, not a turn
    cy.get('#quickTurn').should('have.attr', 'aria-checked', 'false')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailArr).then((flight: FlightRow) => {
      expect(flight.scheduled_departure_time).to.eq(null)
      expect(flight.scheduled_arrival_time).not.to.eq(null)
      expect(flight.is_quick_turn).to.eq(false)
    })
    cy.contains(tailArr, { timeout: 15_000 }).should('be.visible')
    cy.get('body').should(($b) => {
      expect($b.find(`:contains("${tailArr}")`).filter((_, el) => el.children.length === 0)).to.have.length(1)
    })
    cy.get('button[title="Departures Only"]').click()
    cy.contains(tailArr).should('not.exist')
  })

  it('actual times are saved and shown on the card', () => {
    failOnAlert()
    openAddFlightSheet()
    cy.get('#date').invoke('val').then((v) => {
      date = v as string
    })
    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailActual)
    pickAircraftType('b738', /B738/)
    cy.get('#arrivalTime').type('10:00')
    cy.get('#actualArrivalTime').type('10:07')
    cy.get('#actualDepartureTime').type('11:02')
    submit()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightByTail', tailActual).then((flight: FlightRow) => {
      expect(flight.is_quick_turn).to.eq(true)
      expect(new Date(flight.actual_arrival_time as string).toISOString()).to.eq(`${date}T10:07:00.000Z`)
      expect(new Date(flight.actual_departure_time as string).toISOString()).to.eq(`${date}T11:02:00.000Z`)
    })
    cy.contains('[data-slot="card"]', tailActual, { timeout: 15_000 }).within(() => {
      cy.contains('QT').should('be.visible')
      cy.contains(/Actual (arr|dep):/).should('be.visible')
    })
  })

  it('submitting with no scheduled time shows an inline message, no alert, and creates nothing', () => {
    const alertStub = cy.stub().as('alert')
    cy.on('window:alert', alertStub)
    openAddFlightSheet()
    cy.get(`input[placeholder="${TAIL_PLACEHOLDER}"]`).type(tailCancel)
    pickAircraftType('b738', /B738/)
    submit()
    cy.get('#timeError').should('contain.text', 'scheduled arrival')
    cy.contains('h2', 'Add New Flight').should('be.visible')
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
