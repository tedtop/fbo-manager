// Port of e2e/flight-states.e2e.ts (Playwright), B18 (F11): empty day, failed fetch with Retry, and a week change
// that keeps the previous flights on screen. (Filters that match nothing: empty-states.cy.ts.)
// The flight fetch is GET /rest/v1/flight; writes (POST/PATCH) are never intercepted here.
const stamp = Date.now().toString(36).toUpperCase()
const tailArr = `CSA${stamp}` // arrival only, today
const tailDep = `CSD${stamp}` // departure only, today
const tails = [tailArr, tailDep]

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

const flightFetch = { method: 'GET', pathname: '/rest/v1/flight' } as const
const search = () => cy.get('input[placeholder="Search flights..."]')

describe('Flight board states', () => {
  // Benign browser notice raised by the calendar grid / Radix popover layout; not an app failure.
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    cy.task('seedFlight', { tail: tailArr, arrivalInMin: todayMin(60), departureInMin: null })
    cy.task('seedFlight', { tail: tailDep, departureInMin: todayMin(120) })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  beforeEach(() => {
    cy.login()
  })

  it('an empty day shows the empty state without a Clear filters action', () => {
    // Answer the board's flight fetch with no rows, whatever else is in the shared local DB.
    cy.intercept(flightFetch, (req) => {
      req.continue((res) => {
        res.send([])
      })
    }).as('flights')
    cy.visit('/')
    cy.wait('@flights')

    cy.contains('No flights today or later', { timeout: 15_000 }).should('be.visible')
    cy.contains(/^No arrivals$/).should('be.visible')
    cy.contains(/^No departures$/).should('be.visible')
    cy.contains('h2', 'Arrivals').should('be.visible')
    cy.contains('h2', 'Departures').should('be.visible')
    cy.contains('button', 'Clear filters').should('not.exist')

    // Proof the emptiness came from the stub, not the data: the seeded rows are in the database.
    cy.task('getFlightByTail', tailArr).its('tail_number').should('eq', tailArr)
    cy.task('getFlightByTail', tailDep).its('tail_number').should('eq', tailDep)
  })

  it('a failed fetch shows the error state with a Retry that recovers', () => {
    // Fail the board's flight fetch with an HTTP error. (A network abort works too but takes ~35 s to
    // surface: postgrest-js retries network errors with backoff inside each react-query retry.)
    let failing = true
    cy.intercept(flightFetch, (req) => {
      if (failing) {
        req.reply({ statusCode: 400, body: { message: 'Forced flight fetch failure' } })
      } else {
        req.continue()
      }
    }).as('flights')
    cy.visit('/')

    // react-query retries 3 times (1s, 2s, 4s backoff) before the error surfaces.
    cy.contains('[role="alert"]', "Couldn't load flights", { timeout: 20_000 })
      .should('contain.text', 'Forced flight fetch failure')
      .as('alert')
    cy.contains(tailArr).should('not.exist')
    search().should('be.visible') // the toolbar stays usable

    cy.then(() => {
      failing = false
    })
    cy.get('@alert').contains('button', 'Retry').click()
    cy.contains(tailArr, { timeout: 15_000 }).should('be.visible')
    cy.contains('[role="alert"]', "Couldn't load flights").should('not.exist')

    cy.task('getFlightByTail', tailArr).its('flight_status').should('eq', 'scheduled')
  })

  it('changing the window keeps the previous flights on screen while it refetches', () => {
    cy.visit('/')
    cy.contains(tailArr, { timeout: 15_000 }).should('be.visible')
    cy.get('button[title="Calendar View"]').click()
    cy.contains('button', 'Prev', { timeout: 15_000 }).should('be.visible')

    // Next week is a new query key; hold its response back.
    cy.intercept(flightFetch, (req) => {
      req.continue((res) => {
        res.setDelay(2_000)
      })
    }).as('nextWeek')
    cy.contains('button', 'Next').click()

    // While the slow fetch is pending the inline indicator shows, but the calendar stays: no skeleton.
    cy.get('[aria-label="Refreshing flights"]').should('be.visible')
    cy.get('[aria-label="Loading calendar"]').should('not.exist')
    cy.contains('button', 'Prev').should('be.visible')
    cy.wait('@nextWeek')
    cy.get('[aria-label="Refreshing flights"]', { timeout: 10_000 }).should('not.exist')
    cy.contains('button', 'Prev').should('be.visible')

    cy.task('getFlightByTail', tailDep).its('tail_number').should('eq', tailDep)
  })
})
