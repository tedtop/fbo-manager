// Cypress spec, B26d: the service catalog end to end. Pills on the form
// and on the card come from the same `service` table; writes go through set_flight_services (flight_service
// junction is the source, the legacy flight.services column is kept in sync).
const stamp = Date.now().toString(36).toUpperCase()
const tailCreate = `CS1${stamp}` // created through the Add Flight form
const tailEdit = `CS2${stamp}` // seeded with services, edited through the form
const tailFilterOn = `CS3${stamp}` // seeded with GPU
const tailFilterOff = `CS4${stamp}` // seeded without services
const tailNoConflict = `CS5${stamp}` // two edits in a row
const tailFail = `CS6${stamp}` // typed into the form while the catalog fetch fails (never saved)
const tailTks = `CS7${stamp}` // TKS fluid with a gallon quantity (B26f)
const tails = [tailCreate, tailEdit, tailFilterOn, tailFilterOff, tailNoConflict, tailFail, tailTks]
const productName = `Ramp Fee ${stamp}`
let productId: number | null = null

const LABELS: Record<string, string> = { hangar: 'Hangar', gpu: 'GPU', lav: 'Lav', oxygen: 'Oxygen', cleaning: 'Cleaning' }
const labelsOf = (keys: string[]) => keys.map((k) => LABELS[k]).sort()

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)
const pill = (key: string) => cy.get(`button[data-service-key="${key}"]`)

// Waits for the catalog-backed labels: while the service catalog loads the card shows placeholders without a key.
const cardPillLabels = (tail: string) => {
  card(tail).find('[data-service-loading]').should('not.exist')
  return card(tail).then(($c) => $c.find('[data-service-key]').toArray().map((el) => (el.textContent ?? '').trim()).sort())
}

const openBoard = (tail: string) => {
  cy.login()
  cy.visit('/')
  cy.contains(tail, { timeout: 15_000 }).should('be.visible')
}

const openEditSheet = (tail: string) => {
  card(tail).contains('button', 'Edit').click()
  cy.contains('Edit Flight').should('be.visible')
}

const update = () => cy.contains('button', 'Update Flight').click()

describe('Service catalog on the board, form and toolbar (B26)', () => {
  before(() => {
    cy.task('seedAircraft', tailCreate)
    cy.task('seedAircraft', tailFail)
    cy.task('seedFlight', { tail: tailEdit, departureInMin: 360, services: ['hangar', 'lav', 'cleaning'] })
    cy.task('seedFlight', { tail: tailFilterOn, departureInMin: 360, services: ['gpu'] })
    cy.task('seedFlight', { tail: tailFilterOff, departureInMin: 360 })
    cy.task('seedFlight', { tail: tailNoConflict, departureInMin: 360, services: ['hangar'] })
    cy.task('seedFlight', { tail: tailTks, departureInMin: 360 })
    // A billable-only item: lives in `product`, must never become a pill or a filter option.
    cy.task('seedFeeProduct', { name: productName, sku: `E2E-SVC-${stamp}` }).then((id) => {
      productId = id as number
    })
  })

  after(() => {
    cy.task('cleanFlights', tails) // flight_service rows cascade with the flight
    if (productId !== null) cy.task('deleteProduct', productId)
  })

  it('services picked in Add Flight (incl. GPU, Lav, Cleaning) show as the same pills on the card and in the junction', () => {
    const picked = ['hangar', 'gpu', 'lav', 'cleaning']
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
    cy.get('input[placeholder="e.g., N12345"]').clear().type(tailCreate)
    cy.get('#aircraftType').click()
    cy.get('input[placeholder="Search code or model (e.g. G650, GLF6)"]').type('b738')
    cy.contains('[role="option"]', /B738/).click()
    cy.get('#departureTime').type('16:45') // departure only: one card, QT unchecks itself
    for (const key of picked) {
      pill(key).click()
      pill(key).should('have.attr', 'aria-pressed', 'true')
    }
    cy.get('[role="dialog"]').contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('not.exist')

    cy.task('getFlightServiceKeys', tailCreate).should('deep.eq', [...picked].sort())
    cy.task('getFlightByTail', tailCreate).then((flight: { services: string[] | null }) => {
      expect([...(flight.services ?? [])].sort()).to.deep.eq([...picked].sort())
    })
    card(tailCreate).should('be.visible')
    cardPillLabels(tailCreate).should('deep.eq', labelsOf(picked))
    cy.reload()
    card(tailCreate).should('be.visible')
    cardPillLabels(tailCreate).should('deep.eq', labelsOf(picked))
  })

  it('edit form preselects the flight services; untoggle one, add one, save updates junction and card', () => {
    openBoard(tailEdit)
    openEditSheet(tailEdit)
    for (const key of ['hangar', 'lav', 'cleaning']) pill(key).should('have.attr', 'aria-pressed', 'true')
    for (const key of ['gpu', 'oxygen', 'catering']) pill(key).should('have.attr', 'aria-pressed', 'false')

    pill('lav').click() // remove
    pill('oxygen').click() // add
    pill('lav').should('have.attr', 'aria-pressed', 'false')
    pill('oxygen').should('have.attr', 'aria-pressed', 'true')
    update()
    cy.contains('Edit Flight').should('not.exist')
    cy.contains('[role="status"]', 'Flight updated').should('be.visible')

    const expected = ['cleaning', 'hangar', 'oxygen']
    cy.task('getFlightServiceKeys', tailEdit).should('deep.eq', expected)
    cy.task('getFlightByTail', tailEdit).then((flight: { services: string[] | null }) => {
      expect([...(flight.services ?? [])].sort()).to.deep.eq(expected)
    })
    cardPillLabels(tailEdit).should('deep.eq', labelsOf(expected))
    card(tailEdit).find('[data-service-key="lav"]').should('not.exist')
  })

  it('toolbar services filter lists the catalog, narrows the board and Clear resets it', () => {
    openBoard(tailFilterOn)
    cy.contains(tailFilterOff).should('exist')
    cy.contains('button', 'Filters').click()
    for (const label of ['GPU', 'Lav', 'Oxygen', 'Cleaning', 'Ground Transport']) {
      cy.get('[role="dialog"]').contains(label).should('be.visible')
    }
    cy.get('[role="dialog"]').contains(/^GPU$/).click()
    cy.contains(tailFilterOn).should('exist')
    cy.contains(tailFilterOff).should('not.exist')

    cy.get('[role="dialog"]').contains('button', 'Clear').click()
    cy.contains(tailFilterOff).should('exist')
    cy.contains(tailFilterOn).should('exist')
  })

  it('a billable-only product never appears in the picker or the toolbar filter', () => {
    openBoard(tailFilterOn)
    cy.contains('button', 'Filters').click()
    cy.get('[role="dialog"]').contains(/^GPU$/).should('be.visible')
    cy.get('[role="dialog"]').should('not.contain.text', 'Ramp Fee')
    cy.get('body').type('{esc}')

    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
    cy.task('countActiveServices').then((count) => {
      cy.get('button[data-service-key]').should('have.length', count as number)
    })
    cy.get('[role="dialog"]').should('not.contain.text', 'Ramp Fee')
  })

  it('catalog fetch failure shows the loading skeleton, then an empty picker, and the form keeps working', () => {
    // Only the service table (not flight_service); react-query retries 3 times before giving up.
    cy.intercept({ method: 'GET', pathname: '/rest/v1/service' }, {
      statusCode: 500,
      body: { code: 'XX000', message: 'forced e2e catalog failure', details: null, hint: null },
    })
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')

    cy.get('[role="dialog"] [aria-busy="true"]').should('exist')
    cy.get('[role="dialog"] [aria-busy="true"]', { timeout: 20_000 }).should('not.exist')
    cy.get('button[data-service-key]').should('not.exist')

    // The rest of the form is unaffected.
    cy.get('[role="dialog"]').contains('Services').should('be.visible')
    cy.get('input[placeholder="e.g., N12345"]').clear().type(tailFail)
    cy.get('input[placeholder="e.g., N12345"]').should('have.value', tailFail)
    cy.get('[role="dialog"]').contains('button', 'Add Flight').should('be.enabled')
  })

  it('TKS Fluid takes a gallon quantity: saved on the junction, shown on the card, preselected on edit and changeable', () => {
    const qty = 'input[aria-label="TKS Fluid quantity (gal)"]'
    openBoard(tailTks)
    openEditSheet(tailTks)
    cy.get(qty).should('not.exist') // a quantity input only exists while the pill is selected
    pill('tks_fluid').click()
    cy.get(qty).should('have.value', '1')
    cy.get(qty).clear().type('12')
    update()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightServiceQuantity', { tail: tailTks, key: 'tks_fluid' }).should('eq', 12)
    cardPillLabels(tailTks).should('deep.eq', ['TKS Fluid · 12 gal'])

    openEditSheet(tailTks)
    pill('tks_fluid').should('have.attr', 'aria-pressed', 'true')
    cy.get(qty).should('have.value', '12')
    cy.get(qty).clear().type('20')
    update()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightServiceQuantity', { tail: tailTks, key: 'tks_fluid' }).should('eq', 20)
    cardPillLabels(tailTks).should('deep.eq', ['TKS Fluid · 20 gal'])
  })

  it('the next edit after a services edit has no false concurrency conflict', () => {
    openBoard(tailNoConflict)
    openEditSheet(tailNoConflict)
    pill('gpu').click()
    update()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightServiceKeys', tailNoConflict).should('deep.eq', ['gpu', 'hangar'])

    // No reload: the card must carry the fresh updated_at from the post-RPC re-read.
    openEditSheet(tailNoConflict)
    cy.get('#notes').clear().type('second edit after services')
    update()
    cy.contains('Edit Flight').should('not.exist')
    cy.contains('Someone else saved changes to this record').should('not.exist')

    cy.task('getFlightByTail', tailNoConflict).should((flight: { notes: string | null }) => {
      expect(flight.notes).to.eq('second edit after services')
    })
    cy.task('getFlightServiceKeys', tailNoConflict).should('deep.eq', ['gpu', 'hangar'])
  })
})
