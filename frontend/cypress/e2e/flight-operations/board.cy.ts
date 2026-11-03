// Port of e2e/flight-board.e2e.ts (Playwright) plus filters, calendar and empty state (BACKLOG B08c).
// Realtime insert is deliberately not covered here (blocked on B16).
// KNOWN BUG tags (F1..F9) pin today's behavior; each flips when the matching backlog item lands.
const stamp = Date.now().toString(36).toUpperCase()
const tailTurn = `CBT${stamp}` // arrival + departure, scheduled, hangar
const tailDep = `CBD${stamp}` // departure only, scheduled
const tailDelayed = `CBL${stamp}` // departure only, delayed, fuel
const tailNext = `CBN${stamp}` // departure exactly one week from now (next calendar week)
const tailPrev = `CBP${stamp}` // departure exactly one week ago (previous calendar week)
const tails = [tailTurn, tailDep, tailDelayed, tailNext, tailPrev]

const DAY = 24 * 60

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
    cy.task('seedFlight', { tail: tailTurn, arrivalInMin: 60, departureInMin: 180, services: ['hangar'] })
    cy.task('seedFlight', { tail: tailDep, departureInMin: 240 })
    cy.task('seedFlight', { tail: tailDelayed, departureInMin: 300, status: 'delayed', services: ['fuel'] })
    cy.task('seedFlight', { tail: tailNext, departureInMin: 7 * DAY })
    cy.task('seedFlight', { tail: tailPrev, departureInMin: -7 * DAY })
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
      // KNOWN BUG F1: flips when B09/B13 land - a flight with both times lands in BOTH columns (quick_turn).
      shownTimes(tailTurn, 2)
    })

    it('toggles departures only / arrivals only / split', () => {
      toolbar('Departures Only').click()
      cy.contains('h2', 'Arrivals').should('not.exist')
      cy.contains('h2', 'Departures').should('be.visible')
      cy.contains(tailDep).should('be.visible')
      cy.contains(tailTurn).should('be.visible')

      toolbar('Arrivals Only').click()
      cy.contains('h2', 'Departures').should('not.exist')
      cy.contains('h2', 'Arrivals').should('be.visible')
      cy.contains(tailDep).should('not.exist') // departure-only flight is not an arrival
      // KNOWN BUG F1: flips when B09/B13 land - the both-times flight is shown in Arrivals too.
      cy.contains(tailTurn).should('be.visible')

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

    it('date range filter does nothing yet', () => {
      openFilters()
      filterSelect('Date Range', 'Tomorrow')
      cy.get('body').type('{esc}')
      // KNOWN BUG F4: flips when B09/B13 land - dateRange is never applied, so "Tomorrow" still shows
      // flights seeded for today. Once fixed, these should be hidden.
      for (const t of [tailTurn, tailDep, tailDelayed]) cy.contains(t).should('exist')
    })

    it('shows the empty state when nothing matches', () => {
      cy.get('input[placeholder="Search flights..."]').type(`ZZNOMATCH${stamp}`)
      cy.contains('No arrivals found').should('be.visible')
      cy.contains('No departures found').should('be.visible')
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
