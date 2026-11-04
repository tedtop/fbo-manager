// B42: a flight shown in both columns (quick turn, or a stay with both times) is ONE record, so hovering
// either card highlights both. Flights shown once (arrival-only, departure-only) are never linked.
const stamp = Date.now().toString(36).toUpperCase()
const tailTurn = `CLT${stamp}` // quick turn: both columns
const tailStay = `CLS${stamp}` // stay with both times, not QT: both columns
const tailArr = `CLA${stamp}` // arrival only
const tailDep = `CLD${stamp}` // departure only
const tails = [tailTurn, tailStay, tailArr, tailDep]

const DAY = 24 * 60
const MIN = 60_000
// Minutes from now, clamped into today's local day (00:05..23:55) so seeds never spill into tomorrow.
const todayMin = (offsetMin: number) => {
  const now = Date.now()
  const d = new Date(now)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const t = Math.min(dayStart + DAY * MIN - 5 * MIN, Math.max(dayStart + 5 * MIN, now + offsetMin * MIN))
  return (t - now) / MIN
}

// Retrying assertions over every card of a tail (hover state lands a render after the event).
const allHave = (tail: string, cls: string) =>
  cards(tail).should(($c) => $c.each((_, el) => expect(el).to.have.class(cls)))
const noneHave = (tail: string, cls: string) =>
  cards(tail).should(($c) => $c.each((_, el) => expect(el).not.to.have.class(cls)))
const cards = (tail: string) => cy.get('[data-slot="card"]').filter(`:contains("${tail}")`)
const arrivalsCard = (tail: string) => cy.contains('h2', 'Arrivals').parent().parent().contains('[data-slot="card"]', tail)
const departuresCard = (tail: string) => cy.contains('h2', 'Departures').parent().parent().contains('[data-slot="card"]', tail)

describe('Linked flight hover', () => {
  // Benign browser notice raised by layout; not an app failure.
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  before(() => {
    cy.task('seedFlight', { tail: tailTurn, arrivalInMin: todayMin(60), departureInMin: todayMin(120), isQuickTurn: true })
    cy.task('seedFlight', { tail: tailStay, arrivalInMin: todayMin(30), departureInMin: todayMin(400) })
    cy.task('seedFlight', { tail: tailArr, arrivalInMin: todayMin(90), departureInMin: null })
    cy.task('seedFlight', { tail: tailDep, departureInMin: todayMin(240) })
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  beforeEach(() => {
    cy.login()
    cy.visit('/')
    cy.contains(tailTurn, { timeout: 15_000 }).should('be.visible')
  })

  for (const [label, tail] of [
    ['quick turn', tailTurn],
    ['stay with both times', tailStay]
  ] as const) {
    it(`${label}: hovering the arrival card highlights both cards, and clears on leave`, () => {
      cards(tail).should('have.length', 2)
      allHave(tail, 'border-l-4')
      arrivalsCard(tail).trigger('mouseover')
      allHave(tail, 'ring-2')
      // Both cards draw the same link-coloured ring.
      cards(tail).should(($c) => {
        const rings = $c.toArray().map((el) => el.className.match(/(?:^|\s)(ring-[a-z]+-500)(?:\s|$)/)?.[1])
        expect(rings[0], 'link ring color').to.be.a('string')
        expect(rings[1]).to.equal(rings[0])
      })
      arrivalsCard(tail).trigger('mouseout')
      noneHave(tail, 'ring-2')
    })

    it(`${label}: hovering the departure card highlights both cards`, () => {
      departuresCard(tail).trigger('mouseover')
      allHave(tail, 'ring-2')
    })
  }

  it('hovering one flight does not highlight another flight', () => {
    arrivalsCard(tailTurn).trigger('mouseover')
    noneHave(tailStay, 'ring-2')
  })

  it('a flight shown once is not linked: no link border, and its hover highlights only itself', () => {
    cards(tailArr).should('have.length', 1).and('not.have.class', 'border-l-4')
    cards(tailDep).should('have.length', 1).and('not.have.class', 'border-l-4')
    cards(tailDep).trigger('mouseover')
    cards(tailDep).should('have.class', 'ring-2')
    noneHave(tailTurn, 'ring-2')
  })
})
