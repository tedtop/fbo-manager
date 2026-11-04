// B18 (F11): the empty state explains active filters (and offers Clear filters) instead of a bare
// "No arrivals found". The plain empty-day copy, the error state with Retry and the loading behavior are
// covered by e2e/flight-states.e2e.ts.
const stamp = Date.now().toString(36).toUpperCase()
const tailArr = `CEA${stamp}` // arrival only, today
const tailDep = `CED${stamp}` // departure only, today
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

const search = () => cy.get('input[placeholder="Search flights..."]')
const openFilters = () => cy.contains('button', 'Filters').click()
const filterSelect = (label: string, option: string) => {
  cy.contains('label', label).parent().find('[role="combobox"]').click()
  cy.contains('[role="option"]', option).click()
}

describe('Flight board empty states', () => {
  // Benign browser notice raised by the Radix popover layout; not an app failure.
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
    cy.visit('/')
    cy.contains(tailArr, { timeout: 15_000 }).should('be.visible')
    cy.contains(tailDep).should('be.visible')
  })

  it('names the search when nothing matches, and Clear filters brings the flights back', () => {
    const nothing = `ZZNOMATCH${stamp}`
    search().type(nothing)
    cy.contains(`No flights match: search '${nothing}'`).should('be.visible')
    cy.contains(tailArr).should('not.exist')
    cy.contains(tailDep).should('not.exist')

    cy.contains('button', 'Clear filters').click()
    search().should('have.value', '')
    cy.contains(tailArr).should('be.visible')
    cy.contains(tailDep).should('be.visible')
    cy.contains('Clear filters').should('not.exist')
  })

  it('explains an emptied column on its own while the other column still lists its match', () => {
    search().type(tailDep)
    cy.contains(`No arrivals match: search '${tailDep}'`).should('be.visible')
    cy.contains('[data-slot="card"]', tailDep).should('be.visible')

    cy.contains('button', 'Clear filters').click()
    cy.contains(tailArr).should('be.visible')
  })

  it('lists status and search together in the message', () => {
    const nothing = `ZZNOMATCH${stamp}`
    openFilters()
    filterSelect('Status', 'Delayed') // nothing seeded is delayed
    cy.get('body').type('{esc}')
    search().type(nothing)
    cy.contains(`No flights match: status = Delayed, search '${nothing}'`).should('be.visible')

    cy.contains('button', 'Clear filters').click()
    cy.contains(tailArr).should('be.visible')
  })
})
