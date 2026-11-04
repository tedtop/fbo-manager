// Port of e2e/flight-board.e2e.ts (Playwright) plus filters, calendar and empty state (BACKLOG B08c).
// Realtime insert/update/soft-delete is covered in realtime.cy.ts (B16).
// KNOWN BUG tags (F5..F9; F3 landed in B14, F4 in B13) pin today's behavior; each flips when the matching backlog item lands.
// Classification (D2/D6): Arrivals = has a scheduled arrival, Departures = has a scheduled departure.
const stamp = Date.now().toString(36).toUpperCase()
const tailTurn = `CBT${stamp}` // arrival + departure, scheduled, hangar
const tailDep = `CBD${stamp}` // departure only, scheduled
const tailDelayed = `CBL${stamp}` // departure only, delayed, fuel
const tailArr = `CBA${stamp}` // arrival only (return), scheduled
const tailNext = `CBN${stamp}` // departure exactly one week from now (next calendar week)
const tailPrev = `CBP${stamp}` // departure exactly one week ago (previous calendar week)
const tailFar = `CBF${stamp}` // departure exactly six weeks from now (beyond the old +-4 week window)
const tailTomorrow = `CBM${stamp}` // departure tomorrow (local day), noon
const tailMonth = `CBX${stamp}` // departure 30 days out (outside the default -1..+14 day fetch window)
const tails = [tailTurn, tailDep, tailDelayed, tailArr, tailNext, tailPrev, tailFar, tailTomorrow, tailMonth]

const DAY = 24 * 60
const MIN = 60_000
// Minutes from now until `offsetMin` from now, clamped into today's local day (00:05..23:55) so the
// "today" seeds do not spill into tomorrow late in the evening.
const todayMin = (offsetMin: number) => {
  const now = Date.now()
  const d = new Date(now)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const t = Math.min(dayStart + DAY * MIN - 5 * MIN, Math.max(dayStart + 5 * MIN, now + offsetMin * MIN))
  return (t - now) / MIN
}
// Minutes from now until local noon `days` calendar days ahead (DST-safe).
const noonMin = (days: number) => {
  const d = new Date()
  return (new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12).getTime() - d.getTime()) / MIN
}

const openBoard = () => {
  cy.login()
  cy.visit('/')
  cy.contains(tailTurn, { timeout: 15_000 }).should('be.visible')
}
// Number of leaf elements showing this tail (a flight card per column it appears in).
const shownTimes = (t: string, n: number) =>
  cy.get('body').should(($b) => {
    expect($b.find(`:contains("${t}")`).filter((_, el) => el.children.length === 0)).to.have.length(n)
  })
const toolbar = (title: string) => cy.get(`button[title="${title}"]`)
const openFilters = () => cy.contains('button', 'Filters').click()
const filterSelect = (label: string, option: string) => {
  cy.contains('label', label).parent().find('[role="combobox"]').click()
  cy.contains('[role="option"]', option).click()
}

describe('Flight board', () => {
  // Benign browser notice raised by the calendar grid / Radix popover layout; not an app failure.
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    cy.task('seedFlight', { tail: tailTurn, arrivalInMin: todayMin(60), departureInMin: todayMin(120), services: ['hangar'], isQuickTurn: true })
    cy.task('seedFlight', { tail: tailArr, arrivalInMin: todayMin(90), departureInMin: null })
    cy.task('seedFlight', { tail: tailDep, departureInMin: todayMin(240) })
    cy.task('seedFlight', { tail: tailDelayed, departureInMin: todayMin(300), status: 'delayed', services: ['fuel'] })
    cy.task('seedFlight', { tail: tailNext, departureInMin: 7 * DAY })
    cy.task('seedFlight', { tail: tailPrev, departureInMin: -7 * DAY })
    cy.task('seedFlight', { tail: tailFar, departureInMin: 42 * DAY })
    cy.task('seedFlight', { tail: tailTomorrow, departureInMin: noonMin(1) })
    cy.task('seedFlight', { tail: tailMonth, departureInMin: noonMin(30) })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  describe('list views', () => {
    beforeEach(openBoard)

    it('shows seeded flights on the split board', () => {
      cy.contains('h2', 'Arrivals').should('be.visible')
      cy.contains('h2', 'Departures').should('be.visible')
      for (const t of [tailTurn, tailDep, tailDelayed]) cy.contains(t).should('be.visible')

      // Departure-only flights appear once (departures column only).
      shownTimes(tailDep, 1)
      shownTimes(tailDelayed, 1)
      shownTimes(tailArr, 1) // arrival-only flight appears once (arrivals column only)
      // A quick turn lands in BOTH columns.
      shownTimes(tailTurn, 2)
    })

    it('toggles departures only / arrivals only / split', () => {
      toolbar('Departures Only').click()
      cy.contains('h2', 'Arrivals').should('not.exist')
      cy.contains('h2', 'Departures').should('be.visible')
      cy.contains(tailDep).should('be.visible')
      cy.contains(tailTurn).should('be.visible')
      cy.contains(tailArr).should('not.exist') // arrival-only flight is not a departure

      toolbar('Arrivals Only').click()
      cy.contains('h2', 'Departures').should('not.exist')
      cy.contains('h2', 'Arrivals').should('be.visible')
      cy.contains(tailDep).should('not.exist') // departure-only flight is not an arrival
      cy.contains(tailTurn).should('be.visible') // the quick turn is in Arrivals too
      cy.contains(tailArr).should('be.visible')

      toolbar('Split View').click()
      cy.contains('h2', 'Arrivals').should('be.visible')
      cy.contains('h2', 'Departures').should('be.visible')
      cy.contains(tailDep).should('be.visible')
    })

    it('search by tail number filters the board, clearing restores it', () => {
      cy.get('input[placeholder="Search flights..."]').type(tailDep)
      cy.contains(tailDep).should('be.visible')
      cy.contains(tailTurn).should('not.exist')
      cy.contains(tailDelayed).should('not.exist')

      cy.get('input[placeholder="Search flights..."]').clear()
      cy.contains(tailTurn).should('be.visible')
    })

    it('status filter narrows the board', () => {
      openFilters()
      filterSelect('Status', 'Delayed')
      cy.get('body').type('{esc}')
      cy.contains(tailDelayed).should('be.visible')
      cy.contains(tailDep).should('not.exist')
      cy.contains(tailTurn).should('not.exist')
    })

    it('services filter narrows the board and Clear resets it', () => {
      openFilters()
      cy.get('[role="dialog"]').contains('Hangar').click()
      cy.contains(tailTurn).should('exist')
      cy.contains(tailDep).should('not.exist')
      cy.contains(tailDelayed).should('not.exist')

      cy.get('[role="dialog"]').contains('button', 'Clear').click()
      cy.contains(tailDep).should('exist')
      cy.contains(tailDelayed).should('exist')
    })

    // B13 / F4: the date range filters by LOCAL day; the list fetch is bounded (-1..+14 days) except for
    // Today + Future (no upper bound) and "All Dates".
    // B43b: the default is Today + Future: every flight whose stay ends today or later, however far out.
    it('default view is Today + Future: today, tomorrow and far-out flights are shown, past ones are not', () => {
      for (const t of [tailTurn, tailDep, tailDelayed, tailArr, tailTomorrow, tailMonth, tailNext, tailFar]) {
        cy.contains(t).should('exist')
      }
      cy.contains(tailPrev).should('not.exist') // left a week ago
      openFilters()
      cy.contains('label', 'Date Range').parent().find('[role="combobox"]').should('have.text', 'Today + Future')
    })

    // B43: the plane that arrived and has no departure yet (tailArr) stays on the ramp, so it is on tomorrow too.
    it('Tomorrow shows tomorrow\'s flights and the aircraft still on the ramp', () => {
      openFilters()
      filterSelect('Date Range', 'Tomorrow')
      cy.get('body').type('{esc}')
      cy.contains(tailTomorrow).should('exist')
      cy.contains(tailArr).should('exist')
      for (const t of [tailTurn, tailDep, tailDelayed, tailMonth]) cy.contains(t).should('not.exist')
    })

    it('Today shows only today\'s flights', () => {
      openFilters()
      filterSelect('Date Range', 'Tomorrow')
      filterSelect('Date Range', 'Today')
      cy.get('body').type('{esc}')
      for (const t of [tailTurn, tailDep, tailDelayed, tailArr]) cy.contains(t).should('exist')
      cy.contains(tailTomorrow).should('not.exist')
      cy.contains(tailMonth).should('not.exist')
    })

    it('All Dates opts in to the unbounded fetch and includes a flight 30 days out', () => {
      openFilters()
      filterSelect('Date Range', 'Today') // bounded by the day (and the -1..+14 day fetch window)
      cy.contains(tailMonth).should('not.exist')
      filterSelect('Date Range', 'All Dates')
      cy.get('body').type('{esc}')
      cy.contains(tailMonth, { timeout: 15_000 }).should('exist')
      cy.contains(tailTomorrow).should('exist')
      cy.contains(tailTurn).should('exist')
    })

    it('shows the empty state when nothing matches', () => {
      cy.get('input[placeholder="Search flights..."]').type(`ZZNOMATCH${stamp}`)
      // B18: the empty state names the filter (details in empty-states.cy.ts).
      cy.contains(`No flights match: search 'ZZNOMATCH${stamp}'`).should('be.visible')
      cy.contains(tailTurn).should('not.exist')
    })
  })

  describe('calendar view', () => {
    beforeEach(() => {
      openBoard()
      toolbar('Calendar View').click()
      cy.contains('button', 'Prev').should('be.visible')
    })

    // NOTE: the board has a week calendar only; there is no day view in the UI today.
    // The current-week assertions assume the +1h..+5h seeds fall in the current Sunday-start week
    // (flaky only in the last hours of Saturday).
    it('shows this week with the seeded flights', () => {
      cy.contains(tailTurn).should('exist')
      cy.contains(tailDep).should('exist')
      cy.contains(tailDelayed).should('exist')
      cy.contains(tailNext).should('not.exist')
      cy.contains(tailPrev).should('not.exist')
    })

    it('Next / Prev move between weeks and change the range header', () => {
      cy.contains(/\d+\/\d+\/\d+ - \d+\/\d+\/\d+/).invoke('text').then((thisWeek) => {
        cy.contains('button', 'Next').click()
        cy.contains(thisWeek).should('not.exist')
        cy.contains(tailNext).should('exist')
        cy.contains(tailTurn).should('not.exist')

        cy.contains('button', 'Prev').click()
        cy.contains(thisWeek).should('be.visible')
        cy.contains('button', 'Prev').click()
        cy.contains(tailPrev).should('exist')
        cy.contains(tailTurn).should('not.exist')
      })
    })

    // B10 / F5: the calendar loads the visible week (not a fixed today +-28 days), so any week is reachable.
    it('navigating more than 4 weeks ahead loads that week\'s flights', () => {
      cy.contains(tailFar).should('not.exist')
      for (let week = 1; week <= 6; week++) {
        cy.contains('button', 'Next').click()
        cy.contains('button', 'Next').should('be.visible') // calendar remounts after the week's load
        if (week < 6) cy.contains(tailFar).should('not.exist')
      }
      cy.contains(tailFar, { timeout: 15_000 }).should('exist')
    })

    it('search and status filters apply to the calendar', () => {
      cy.get('input[placeholder="Search flights..."]').type(tailDep)
      cy.contains(tailDep).should('exist')
      cy.contains(tailTurn).should('not.exist')

      cy.get('input[placeholder="Search flights..."]').clear()
      openFilters()
      filterSelect('Status', 'Delayed')
      cy.get('body').type('{esc}')
      cy.contains(tailDelayed).should('exist')
      cy.contains(tailDep).should('not.exist')
    })

    it('remembers the calendar view after reload', () => {
      cy.reload()
      cy.contains('button', 'Prev').should('be.visible')
    })
  })
})
