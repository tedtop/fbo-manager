// B43b / D13: hide finished flights. Hide button (right of Edit), Show hidden filter, Departed hides from
// the next day, Today + Future default. One seeded flight per test so tail text maps to exactly one card.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

// Own tail prefix and a per-run counter, so no tail is a substring of another.
const stamp = Date.now().toString(36).toUpperCase()
const tailHidden = `CH1${stamp}` // hidden by hand an hour ago
const tailOld = `CH2${stamp}` // arrival-only, Departed days ago: hidden_at has passed
const tailToday = `CH3${stamp}` // Departed today: hidden_at is the start of tomorrow, still on today's board
const tailHideMe = `CH4${stamp}`
const tailDepartMe = `CH5${stamp}`
const tailStale = `CH6${stamp}`
const tails = [tailHidden, tailOld, tailToday, tailHideMe, tailDepartMe, tailStale]

const DAY = 24 * 60
const MIN = 60_000
// Minutes from now, clamped into today's local day (00:05..23:55) so the seeds never spill into tomorrow.
const todayMin = (offsetMin: number) => {
  const now = Date.now()
  const d = new Date(now)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const t = Math.min(dayStart + DAY * MIN - 5 * MIN, Math.max(dayStart + 5 * MIN, now + offsetMin * MIN))
  return (t - now) / MIN
}
const minutesUntil = (at: Date) => (at.getTime() - Date.now()) / MIN
const startOfTomorrow = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}
const startOfToday = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)
const openFilters = () => cy.contains('button', 'Filters').click()
const setShowHidden = (on: boolean) => {
  openFilters()
  cy.get('[role="switch"]#show-hidden-flights').then(($sw) => {
    if (($sw.attr('aria-checked') === 'true') !== on) cy.wrap($sw).click()
  })
  cy.get('body').type('{esc}')
}

describe('Hide finished flights', () => {
  // Benign browser notice raised by the Radix popover layout; not an app failure.
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    cy.task('seedFlight', { tail: tailHidden, departureInMin: todayMin(180), hiddenInMin: -60 })
    cy.task('seedFlight', {
      tail: tailOld,
      arrivalInMin: minutesUntil(new Date(Date.now() - 3 * DAY * MIN)),
      departureInMin: null,
      status: 'departed',
      hiddenInMin: minutesUntil(startOfToday()),
    })
    cy.task('seedFlight', { tail: tailToday, departureInMin: todayMin(200), status: 'departed', hiddenInMin: minutesUntil(startOfTomorrow()) })
    cy.task('seedFlight', { tail: tailHideMe, departureInMin: todayMin(210) })
    cy.task('seedFlight', { tail: tailDepartMe, departureInMin: todayMin(220) })
    cy.task('seedFlight', { tail: tailStale, departureInMin: todayMin(230) })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  beforeEach(() => {
    cy.login()
    cy.visit('/')
    cy.contains(tailHideMe, { timeout: 15_000 }).should('be.visible')
  })

  it('hidden flights are off the default board; a flight departed today is still on it', () => {
    card(tailToday).should('be.visible')
    cy.contains(tailHidden).should('not.exist')
    cy.contains(tailOld).should('not.exist')
  })

  it('Show hidden lists hidden flights, marked Hidden with an Unhide button, and turns off again', () => {
    setShowHidden(true)
    for (const tail of [tailHidden, tailOld]) {
      card(tail).should('be.visible')
      card(tail).contains('Hidden').should('be.visible')
      card(tail).contains('button', 'Unhide').should('be.visible')
      card(tail).contains('button', /^Hide$/).should('not.exist')
    }
    // An ordinary card in the same list is not marked.
    card(tailHideMe).contains('Hidden').should('not.exist')
    // counted as an active filter on the Filters button
    cy.contains('button', 'Filters').should('contain.text', '1')

    setShowHidden(false)
    cy.contains(tailHidden).should('not.exist')
    card(tailHideMe).should('be.visible')
  })

  it('Hide sits right of Edit, hides the flight, and Unhide brings it back', () => {
    card(tailHideMe).contains('button', 'Edit').next().should('have.text', 'Hide')

    card(tailHideMe).contains('button', /^Hide$/).click()
    cy.contains('[role="status"]', 'Flight hidden').should('be.visible')
    cy.contains(tailHideMe).should('not.exist')
    cy.task('getFlightByTail', tailHideMe).should((row: FlightRow) => {
      expect(row.hidden_at).not.to.eq(null)
    })

    setShowHidden(true)
    card(tailHideMe).contains('Hidden').should('be.visible')
    card(tailHideMe).contains('button', 'Unhide').click()
    cy.task('getFlightByTail', tailHideMe).should((row: FlightRow) => {
      expect(row.hidden_at).to.eq(null)
    })
    card(tailHideMe).contains('button', /^Hide$/).should('be.visible')
    card(tailHideMe).contains('Hidden').should('not.exist')
  })

  it('a stale card cannot hide a flight someone else just changed', () => {
    // Keep the card stale: refetches (realtime, polling) must not refresh it before the click.
    cy.intercept({ method: 'GET', pathname: '/rest/v1/flight' }, { forceNetworkError: true })
    cy.task('getFlightByTail', tailStale).then((row: FlightRow) => {
      cy.task('touchFlight', { id: row.id, notes: 'changed by someone else' })
    })
    card(tailStale).contains('button', /^Hide$/).click()
    cy.contains('Flight was changed by someone else').should('be.visible')
    cy.task('getFlightByTail', tailStale).should((row: FlightRow) => {
      expect(row.hidden_at).to.eq(null)
    })
  })

  it('setting a flight to Departed keeps it on today\'s board and hides it from tomorrow', () => {
    card(tailDepartMe).contains('Scheduled').click()
    cy.contains('[role="menuitem"]', 'Departed').click()

    cy.task('getFlightByTail', tailDepartMe).should((row: FlightRow) => {
      expect(row.flight_status).to.eq('departed')
      expect(new Date(row.hidden_at as string).getTime()).to.eq(startOfTomorrow().getTime())
    })
    card(tailDepartMe).should('be.visible')
    card(tailDepartMe).contains('Hidden').should('not.exist')
  })
})
