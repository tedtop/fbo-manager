// The add/edit form reads, builds and labels times in the DISPLAY zone (FBO zone, or UTC in Zulu mode).
// Stored values are plain UTC instants. The runner pins the browser to America/Phoenix and the app zone
// defaults to America/Denver: a July flight (MDT) proves the form does not use the browser zone.
// Expected instants are literal UTC strings, worked out by hand (Denver MST = UTC-7, MDT = UTC-6).
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailLocal = `FZ1${stamp}` // created typing local time
const tailZulu = `FZ2${stamp}` // created typing Zulu
const tailNov = `FZ3${stamp}` // seeded November flight, edited in both modes
const tailJul = `FZ4${stamp}` // seeded July flight (MDT)
const tailFlip = `FZ5${stamp}` // seeded, Zulu flipped with the sheet open
const tails = [tailLocal, tailZulu, tailNov, tailJul, tailFlip]

// A future date (so the default Today + Future board shows the flight) in November / July.
const now = new Date()
const futureDay = (month: number, day: number) => {
  const year = now.getUTCFullYear() + (Date.UTC(now.getUTCFullYear(), month - 1, day + 1) > now.getTime() ? 0 : 1)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
const nov = futureDay(11, 10)
const jul = futureDay(7, 15)
const iso = (day: string, hhmm: string) => `${day}T${hhmm}:00.000Z`

const ZULU_KEY = 'fbo.displayZulu'
const card = (tail: string) => cy.contains('[data-slot="card"]', tail)

const openBoard = (zulu = false) => {
  cy.login()
  cy.visit('/')
  cy.get('[data-testid="zulu-toggle"]', { timeout: 15_000 }).should('be.visible')
  if (zulu) {
    cy.get('[data-testid="zulu-toggle"]').click()
    cy.get('[data-testid="zone-banner"]').should('have.text', 'Times in Zulu (UTC)')
  }
}

const openAdd = (zulu = false) => {
  openBoard(zulu)
  cy.contains('button', 'Add Flight').click()
  cy.contains('h2', 'Add New Flight').should('be.visible')
}

const openEdit = (tail: string, zulu = false) => {
  openBoard(zulu)
  cy.contains(tail, { timeout: 15_000 }).should('be.visible')
  card(tail).contains('button', 'Edit').click()
  cy.contains('Edit Flight').should('be.visible')
}

const fillNew = (tail: string, day: string, arrival: string) => {
  cy.get('input[placeholder="e.g., N12345"]').clear().type(tail)
  cy.get('#aircraftType').click()
  cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
  cy.contains('[role="option"]', /B738/).click()
  cy.get('#date').type(day)
  cy.get('#arrivalTime').type(arrival)
}

const submitAdd = () => cy.get('[role="dialog"]').contains('button', 'Add Flight').click()
const submitEdit = () => {
  cy.contains('button', 'Update Flight').click()
  cy.contains('Edit Flight').should('not.exist')
}

const instants = (tail: string) =>
  cy.task('getFlightByTail', tail).then((f) => {
    const row = f as FlightRow
    return [new Date(row.scheduled_arrival_time as string).toISOString(), new Date(row.scheduled_departure_time as string).toISOString()]
  })

// What another tab does when it flips the Zulu toggle: write the preference and fire the storage event.
const flipZuluElsewhere = (on: boolean) =>
  cy.window().then((w) => {
    w.localStorage.setItem(ZULU_KEY, on ? '1' : '0')
    w.dispatchEvent(new w.StorageEvent('storage', { key: ZULU_KEY }))
  })

describe('Flight form follows the display zone', () => {
  before(() => {
    cy.task('seedAircraft', tailLocal)
    cy.task('seedAircraft', tailZulu)
    cy.task('seedFlight', { tail: tailNov, arrivalAt: iso(nov, '14:30'), departureAt: iso(nov, '15:30') })
    cy.task('seedFlight', { tail: tailJul, arrivalAt: iso(jul, '13:30'), departureAt: iso(jul, '14:30') })
    cy.task('seedFlight', { tail: tailFlip, arrivalAt: iso(nov, '14:30'), departureAt: iso(nov, '15:30') })
  })

  beforeEach(() => {
    cy.task('setAppSetting', { key: 'timezone', value: null })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('(a) local mode: typing 07:30 in November stores 14:30Z', () => {
    openAdd()
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'MST')
    cy.get('[data-testid="form-zone-hint"]').should('have.text', 'Times in MST')
    fillNew(tailLocal, nov, '07:30')
    cy.get('#departureTime').should('have.value', '08:30')
    submitAdd()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    instants(tailLocal).should('deep.eq', [iso(nov, '14:30'), iso(nov, '15:30')])
  })

  it('(b) Zulu mode: typing 14:30 stores 14:30Z and the card shows 14:30 Z', () => {
    openAdd(true)
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'Z')
    cy.get('[data-testid="form-zone-label-actual"]').first().should('have.text', 'Z')
    cy.get('[data-testid="form-zone-hint"]').should('have.text', 'Times in Zulu (UTC)')
    fillNew(tailZulu, nov, '14:30')
    submitAdd()
    cy.contains('h2', 'Add New Flight').should('not.exist')
    instants(tailZulu).should('deep.eq', [iso(nov, '14:30'), iso(nov, '15:30')])
    card(tailZulu).should('contain.text', '14:30')
    card(tailZulu).find('[data-testid="flight-time-zone"]').first().should('have.text', 'Z')
  })

  it('(c) edit round trip keeps the instant in local and in Zulu mode', () => {
    openEdit(tailNov)
    cy.get('#date').should('have.value', nov)
    cy.get('#arrivalTime').should('have.value', '07:30')
    cy.get('#departureTime').should('have.value', '08:30')
    submitEdit()
    instants(tailNov).should('deep.eq', [iso(nov, '14:30'), iso(nov, '15:30')])

    openEdit(tailNov, true)
    cy.get('#arrivalTime').should('have.value', '14:30')
    cy.get('#departureTime').should('have.value', '15:30')
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'Z')
    submitEdit()
    instants(tailNov).should('deep.eq', [iso(nov, '14:30'), iso(nov, '15:30')])
  })

  it('(d) a July flight edits as MDT (07:30) and a no-change save leaves the instant identical', () => {
    openEdit(tailJul)
    cy.get('#date').should('have.value', jul)
    cy.get('#arrivalTime').should('have.value', '07:30')
    cy.get('#departureTime').should('have.value', '08:30')
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'MDT')
    cy.get('[data-testid="form-zone-hint"]').should('have.text', 'Times in MDT')
    submitEdit()
    instants(tailJul).should('deep.eq', [iso(jul, '13:30'), iso(jul, '14:30')])
  })

  it('(e) flipping Zulu with the sheet open keeps the instant and changes display and label', () => {
    openEdit(tailFlip)
    cy.get('#arrivalTime').should('have.value', '07:30')
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'MST')
    flipZuluElsewhere(true)
    cy.get('#arrivalTime').should('have.value', '14:30')
    cy.get('#departureTime').should('have.value', '15:30')
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'Z')
    cy.get('[data-testid="form-zone-hint"]').should('have.text', 'Times in Zulu (UTC)')
    flipZuluElsewhere(false)
    cy.get('#arrivalTime').should('have.value', '07:30')
    cy.get('[data-testid="form-zone-label"]').should('have.text', 'MST')
    flipZuluElsewhere(true)
    cy.get('#arrivalTime').should('have.value', '14:30')
    submitEdit()
    instants(tailFlip).should('deep.eq', [iso(nov, '14:30'), iso(nov, '15:30')])
  })
})
