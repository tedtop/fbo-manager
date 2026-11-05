// Port of e2e/schedule-import.e2e.ts (Playwright). B45b: scan the front desk's schedule, review, import. The OCR
// route and the registry lookup are STUBBED with cy.intercept (no Anthropic call, no adsbdb call). The fixture mirrors
// docs/samples/schedule-sheet-2026-11-04.jpg: six printed rows, one leg each (Action column), that become four
// flights. Dates are shifted to the coming days so the board ("Today + Future") shows them, and the tails are random
// so repeated runs do not collide. Printed times are in the app's schedule zone (America/Denver), independent of the
// browser zone the runner pins.
import { normalizeScheduleSheet } from '../../../lib/schedule-import/normalize'
import { zonedWallTimeToInstant } from '../../../lib/schedule-import/zoned-time'

const ZONE = 'America/Denver'
const rand = (n: number) => Math.floor(Math.random() * n)
const letters = () => 'ABCDEFGH'[rand(8)] + 'ABCDEFGH'[rand(8)]
const makeTail = () => `N${100 + rand(800)}${letters()}`
const T = { dep: makeTail(), turn: makeTail(), far: makeTail(), stay: makeTail() }
const tails = Object.values(T)

function zonedDate(offsetDays: number): string {
  // en-CA = YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + offsetDays * 86_400_000)
  )
}
const D1 = zonedDate(1)
const D3 = zonedDate(3)
const D6 = zonedDate(6)
const D9 = zonedDate(9)
const instant = (date: string, hhmm: string) => new Date(zonedWallTimeToInstant(date, hhmm, ZONE).instantMs).toISOString()

const common = { group_date: '', confidence: 'high', needs_review: false }
const SHEET = {
  sheet_date: null,
  date_range_start: D1,
  date_range_end: D9,
  source_software_hint: 'Minuteman Aviation Inc - Scheduled Arrivals and Requests',
  rows: [
    { ...common, tail_number: T.dep, aircraft_type: 'G-IVSP', customer: 'Cash/Check Customer', departure_date: D1, departure_time: '10:00', notes: 'Service Duration - Short Stay; Confirmed 11/04/2026', raw_row_text: 'D1 | 10:00 AM | Depart | G-IVSP' },
    { ...common, tail_number: T.turn, aircraft_type: 'CJ2', customer: 'Buybacks-Contract Fuel', arrival_date: D1, arrival_time: '11:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D1 | 11:00 AM | Arrive | CJ2' },
    { ...common, tail_number: T.turn, aircraft_type: 'CJ2', customer: 'Buybacks-Contract Fuel', departure_date: D1, departure_time: '12:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D1 | 12:00 PM | Depart | CJ2' },
    { ...common, tail_number: T.far, aircraft_type: 'ENCORE', customer: 'Cash/Check Customer', departure_date: D3, departure_time: '12:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D3 | 12:00 PM | Depart | ENCORE' },
    { ...common, tail_number: T.stay, aircraft_type: 'BRAVO', customer: 'Cash/Check Customer', arrival_date: D6, arrival_time: '12:14', services: 'Rental Car - Passenger: Sadler, Fullsize Hertz - Status: Confirmed', notes: 'Service Duration - Short Stay', raw_row_text: 'D6 | 12:14 PM | Arrive | BRAVO' },
    { ...common, tail_number: T.stay, aircraft_type: 'BRAVO', customer: 'Cash/Check Customer', departure_date: D9, departure_time: '16:00', notes: 'Service Duration - Short Stay', raw_row_text: 'D9 | 4:00 PM | Depart | BRAVO' },
  ],
}

// Registry lookup stub: three tails resolve, the fourth is unknown (the printed "BRAVO" must NOT become its type).
const REGISTRY: Record<string, { typeIcao: string; typeDescription: string }> = {
  [T.dep]: { typeIcao: 'GLF4', typeDescription: 'Gulfstream IV' },
  [T.turn]: { typeIcao: 'C25A', typeDescription: 'Citation CJ2' },
  [T.far]: { typeIcao: 'BE40', typeDescription: 'Beechjet 400' },
}

function stubNetwork(opts: { ocrStatus?: number } = {}) {
  cy.intercept('POST', '/api/ocr/schedule-sheet', (req) => {
    if (opts.ocrStatus && opts.ocrStatus !== 200) {
      req.reply({ statusCode: opts.ocrStatus, body: { error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' } })
      return
    }
    // The real route returns the normalized sheet (normalizeScheduleSheet), so the stub does the same.
    req.reply({ statusCode: 200, body: normalizeScheduleSheet(SHEET) })
  }).as('ocr')
  cy.intercept({ method: 'GET', pathname: '/api/aircraft/lookup' }, (req) => {
    const tail = new URL(req.url).searchParams.get('tail') ?? ''
    const hit = REGISTRY[tail]
    req.reply({
      statusCode: 200,
      delay: 150, // visible spinner
      body: {
        result: hit
          ? { tail, icao24: null, ...hit, manufacturer: null, owner: null, ownerCountry: null, photoUrl: null, photoThumbUrl: null, source: 'adsbdb' }
          : null,
      },
    })
  }).as('lookup')
}

const upload = () =>
  cy.get('[data-testid="schedule-file-input"]').selectFile(
    { contents: Cypress.Buffer.from([0xff, 0xd8, 0xff, 0xd9]), fileName: 'schedule.jpg', mimeType: 'image/jpeg' },
    { force: true } // the input is visually hidden; the Choose button forwards to it
  )

const cards = () => cy.get('[data-testid="schedule-review-card"]')
const card = (tail: string) => cy.get(`[data-testid="schedule-review-card"][data-tail="${tail}"]`)

type FlightRow = { id: number; tail_number: string; scheduled_arrival_time: string | null; scheduled_departure_time: string | null; contact_name: string | null; created_by_source: string | null; is_quick_turn: boolean; notes: string | null }
type AircraftRow = { tail_number: string; aircraft_type_icao: string; aircraft_type_display: string | null }

describe('schedule sheet import', () => {
  before(() => {
    cy.task('cleanScheduleImport', tails)
  })
  after(() => {
    cy.task('cleanScheduleImport', tails)
  })
  beforeEach(() => {
    cy.login('admin')
    stubNetwork()
  })

  it('six printed legs become four reviewable flights; Unpair splits a pair', () => {
    cy.visit('/flight-operations/import')
    cy.contains('h1, h2, h3', 'Import schedule').should('be.visible')
    upload()
    cy.wait('@ocr')

    cards().should('have.length', 4)
    cy.get('[data-testid="sheet-info"]').should('contain.text', '4 flights from 6 printed rows')

    card(T.turn).within(() => {
      cy.get('[data-testid="paired-badge"]').should('contain.text', 'Paired from 2 rows')
      cy.contains('Quick turn').should('be.visible')
      cy.get('[data-testid="arrival-time"]').should('have.value', '11:00')
      cy.get('[data-testid="departure-time"]').should('have.value', '12:00')
      cy.get('[data-testid="type-status"]').should('contain.text', 'Registry: ')
    })
    // 60 min gap = quick turn; the 5-day stay is not
    card(T.stay).within(() => {
      cy.contains('Quick turn').should('not.exist')
      cy.get('[data-testid="type-status"]').should('contain.text', 'No registry match')
      cy.get('[data-testid="service-chip"]').should('have.length', 1) // rental_car
    })

    // Undo the pairing: two single-leg cards for the same tail
    card(T.turn).contains('button', 'Unpair').click()
    cards().should('have.length', 5)
    card(T.turn).should('have.length', 2)
    cy.get('[data-testid="paired-badge"]').should('have.length', 1) // only the 5-day stay is still paired
  })

  it('a failed extraction shows the route message and keeps the upload screen', () => {
    stubNetwork({ ocrStatus: 502 }) // registered after beforeEach's stub, so it wins
    cy.visit('/flight-operations/import')
    upload()
    cy.wait('@ocr')
    cy.contains('[role="alert"]', /Extraction failed/).should('contain.text', 'Extraction failed. Check ANTHROPIC_API_KEY')
    cy.get('[data-testid="schedule-file-input"]').should('exist')
  })

  it('import writes four flights, the looked-up types and services; re-scanning adds nothing', () => {
    cy.visit('/flight-operations/import')
    upload()
    cards().should('have.length', 4)
    cy.get('[data-testid="import-button"]', { timeout: 10_000 }).should('be.enabled') // lookups done
    cy.get('[data-testid="import-summary"]').should('contain.text', '4 to add, 0 to update, 0 skipped')
    cy.get('[data-testid="import-button"]').click()
    cy.get('[data-testid="import-result"]', { timeout: 20_000 }).should('contain.text', '4 added, 0 updated, 0 skipped')

    cy.task('getImportedFlights', { tails, count: 4 }).then((data) => {
      const rows = data as FlightRow[]
      const by = Object.fromEntries(rows.map((r) => [r.tail_number, r]))
      expect(new Date(by[T.dep].scheduled_departure_time as string).toISOString()).to.eq(instant(D1, '10:00'))
      expect(by[T.dep]).to.include({ scheduled_arrival_time: null, contact_name: 'Cash/Check Customer', created_by_source: 'front-desk', is_quick_turn: false })
      expect(by[T.turn]).to.include({ is_quick_turn: true, contact_name: 'Buybacks-Contract Fuel', notes: 'Service Duration - Short Stay' })
      expect(new Date(by[T.turn].scheduled_arrival_time as string).toISOString()).to.eq(instant(D1, '11:00'))
      expect(new Date(by[T.turn].scheduled_departure_time as string).toISOString()).to.eq(instant(D1, '12:00'))
      expect(new Date(by[T.stay].scheduled_arrival_time as string).toISOString()).to.eq(instant(D6, '12:14'))
      expect(new Date(by[T.stay].scheduled_departure_time as string).toISOString()).to.eq(instant(D9, '16:00'))
      expect(by[T.stay].is_quick_turn).to.eq(false)

      // Aircraft: type from the registry lookup, never the printed text; unknown tail -> UNKN / Unknown
      cy.task('getAircraftRows', tails).then((aircraft) => {
        const ac = Object.fromEntries((aircraft as AircraftRow[]).map((a) => [a.tail_number, a]))
        expect(ac[T.dep]).to.include({ aircraft_type_icao: 'GLF4' })
        expect(ac[T.turn]).to.include({ aircraft_type_icao: 'C25A' })
        expect(ac[T.stay]).to.include({ aircraft_type_icao: 'UNKN', aircraft_type_display: 'Unknown' })
      })

      // Services go through set_flight_services: the stay has the rental car
      cy.task('getFlightServiceKeysById', by[T.stay].id).should('deep.eq', ['rental_car'])
    })

    // They show on the board
    cy.visit('/')
    cy.get('input[placeholder="Search flights..."]').type(T.far)
    cy.contains(T.far).should('be.visible')

    // Re-scan the same sheet: every flight is a duplicate, nothing to import, nothing created
    cy.visit('/flight-operations/import')
    upload()
    cards().should('have.length', 4)
    cy.get('[data-testid="duplicate-badge"]').should('have.length', 4)
    cy.get('[data-testid="import-summary"]').should('contain.text', '0 to add, 0 to update, 4 skipped')
    cy.get('[data-testid="import-button"]').should('be.disabled')
    cy.task('countFlightsForTails', tails).should('eq', 4)
  })
})

describe('mobile layout (390px)', () => {
  beforeEach(() => {
    cy.viewport(390, 844)
    cy.login('admin')
    stubNetwork()
  })

  it('board shows the icon button; the review is stacked cards with no sideways scroll', () => {
    cy.visit('/')
    cy.contains('a', 'Import schedule').should('be.visible').click()
    cy.location('pathname').should('eq', '/flight-operations/import')

    upload()
    cards().should('have.length', 4)
    cy.get('[data-testid="import-button"]').should('be.visible')
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth - doc.documentElement.clientWidth).to.be.at.most(0)
    })
    cards().should(($els) => {
      for (const el of $els.toArray()) expect(el.getBoundingClientRect().width).to.be.at.most(390)
      const tops = $els.toArray().map((el) => el.getBoundingClientRect().top)
      expect([...tops].sort((a, b) => a - b)).to.deep.eq(tops) // one column
    })
  })
})
