import { taskUntil } from '../../support/task-poll'

// The board follows the FBO time zone (app_setting `timezone`, default America/Denver) instead of the browser's,
// and a per-user Zulu toggle (localStorage fbo.displayZulu) shows UTC. The runner pins the browser zone to
// America/Phoenix, so a Denver label in summer (MDT) proves the board is not using the browser zone. Expected
// labels are computed here with Intl, independently of the app's own helpers.
// The Filters popover throws a benign ResizeObserver error that Cypress would count as a failure.
Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

const KEY = 'timezone'
const stamp = Date.now().toString(36).toUpperCase()
const tailFixed = `CZF${stamp}` // fixed instants: 03:30Z..04:30Z ten days ahead
const tailEdge = `CZE${stamp}` // Today in the FBO zone, but not the Zulu day

const label = (iso: string, zone: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value])
  )
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`
}
const suffix = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
    .find((x) => x.type === 'timeZoneName')?.value as string

const ymd = (iso: string, zone: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: zone })

const tenDays = ymd(new Date(Date.now() + 10 * 86_400_000).toISOString(), 'UTC')
const arrivalAt = `${tenDays}T03:30:00.000Z`
const departureAt = `${tenDays}T04:30:00.000Z`

// An instant that is "today" in Denver but never "today" in Zulu: late evening Denver time while the UTC date
// is still the same day (it is already tomorrow in UTC), or just after Denver midnight once UTC has moved on.
function edgeInstant(): string {
  const now = new Date()
  const denverDate = ymd(now.toISOString(), 'America/Denver')
  const sameDate = ymd(now.toISOString(), 'UTC') === denverDate
  const hhmm = sameDate ? '23:30' : '00:30'
  // Find the instant whose Denver wall clock is `denverDate hhmm` (scan the two possible offsets).
  for (const offset of [6, 7]) {
    const [h, m] = hhmm.split(':').map(Number)
    const candidate = new Date(Date.parse(`${denverDate}T00:00:00Z`) + ((h + offset) * 60 + m) * 60_000).toISOString()
    if (label(candidate, 'America/Denver').endsWith(hhmm) && ymd(candidate, 'America/Denver') === denverDate) return candidate
  }
  throw new Error('edgeInstant: no Denver instant found')
}

const openBoard = () => {
  cy.login()
  cy.visit('/')
  cy.contains('[data-slot="card"]', tailFixed, { timeout: 15_000 }).should('be.visible')
}
const fixedCard = () => cy.contains('[data-slot="card"]', tailFixed)

describe('Board time zone and Zulu', () => {
  before(() => {
    cy.task('setAppSetting', { key: KEY, value: null }) // never set: the Denver default
    cy.task('seedFlight', { tail: tailFixed, arrivalAt, departureAt })
    cy.task('seedFlight', { tail: tailEdge, arrivalAt: edgeInstant(), departureInMin: null })
  })

  beforeEach(() => {
    cy.task('setAppSetting', { key: KEY, value: null })
  })

  after(() => {
    cy.task('setAppSetting', { key: KEY, value: null })
    cy.task('cleanFlights', [tailFixed, tailEdge])
  })

  it('shows Denver times with the MST/MDT suffix, not the browser zone', () => {
    openBoard()
    fixedCard().should('contain.text', label(arrivalAt, 'America/Denver'))
    fixedCard().find('[data-testid="flight-time-zone"]').first().should('have.text', suffix(arrivalAt, 'America/Denver'))
    cy.get('[data-testid="zone-banner"]').should('have.text', `Times in ${suffix(new Date().toISOString(), 'America/Denver')}`)
    cy.get('[data-testid="zulu-toggle"]').should('have.text', 'Z')
  })

  it('Zulu toggle shows UTC times with Z, says so in the banner, and survives a reload', () => {
    openBoard()
    cy.get('[data-testid="zulu-toggle"]').click()
    fixedCard().should('contain.text', label(arrivalAt, 'UTC'))
    fixedCard().find('[data-testid="flight-time-zone"]').first().should('have.text', 'Z')
    cy.get('[data-testid="zone-banner"]').should('have.text', 'Times in Zulu (UTC)')
    cy.get('[data-testid="zulu-toggle"]').should('have.text', 'Local')
    cy.window().then((w) => expect(w.localStorage.getItem('fbo.displayZulu')).to.eq('1'))

    cy.reload()
    cy.contains('[data-slot="card"]', tailFixed, { timeout: 15_000 }).should('contain.text', label(arrivalAt, 'UTC'))
    cy.get('[data-testid="zone-banner"]').should('have.text', 'Times in Zulu (UTC)')

    cy.get('[data-testid="zulu-toggle"]').click()
    fixedCard().should('contain.text', label(arrivalAt, 'America/Denver'))
    cy.window().then((w) => expect(w.localStorage.getItem('fbo.displayZulu')).to.eq('0'))
  })

  it('changing the FBO time zone in Settings changes the displayed times', () => {
    cy.login()
    cy.visit('/settings')
    cy.get('#timeZone').should('have.value', 'America/Denver')
    cy.get('#timeZone').select('America/New_York')
    cy.contains('Settings saved').should('be.visible')
    taskUntil<string | null>('getAppSetting', KEY, (value) => expect(value).to.eq('America/New_York'))

    cy.visit('/')
    cy.contains('[data-slot="card"]', tailFixed, { timeout: 15_000 }).should('contain.text', label(arrivalAt, 'America/New_York'))
    fixedCard().find('[data-testid="flight-time-zone"]').first().should('have.text', suffix(arrivalAt, 'America/New_York'))
    cy.get('[data-testid="zone-banner"]').should('have.text', `Times in ${suffix(new Date().toISOString(), 'America/New_York')}`)
  })

  it('a stored Phoenix zone is honoured (no daylight saving)', () => {
    cy.task('setAppSetting', { key: KEY, value: 'America/Phoenix' })
    openBoard()
    fixedCard().should('contain.text', label(arrivalAt, 'America/Phoenix'))
    cy.get('[data-testid="zone-banner"]').should('have.text', 'Times in MST')
  })

  it('the Today filter follows the zone: in Denver the flight is today, in Zulu it is not', () => {
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Filters').click()
    cy.contains('label', 'Date Range').parent().find('[role="combobox"]').click()
    cy.contains('[role="option"]', /^Today$/).click()
    cy.get('body').type('{esc}')
    cy.contains('[data-slot="card"]', tailEdge, { timeout: 15_000 }).should('be.visible')

    cy.get('[data-testid="zulu-toggle"]').click()
    cy.contains('[data-slot="card"]', tailEdge).should('not.exist')

    cy.get('[data-testid="zulu-toggle"]').click()
    cy.contains('[data-slot="card"]', tailEdge, { timeout: 15_000 }).should('be.visible')
  })
})
