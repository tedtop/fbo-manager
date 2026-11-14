import { taskUntil } from '../../support/task-poll'

// Cypress spec (B139): (a) archiving an area re-resolves the planes' parked_area_id; (b) when the boundary save or the
// archive went through but the plane recompute failed, the toast says so (not "could not save") and Retry re-runs only
// the recompute. The failure is forced by failing the aircraft PATCH; every check ends in a direct DB read.
const stamp = Date.now().toString(36).toUpperCase()
const code = `CYB139${stamp}`
const tailInside = `NB139I${stamp}`

const M = 111_320
const CENTRE: [number, number] = [-114.08587471583614, 46.92183963008256]

const ringFromMetres = (corners: [number, number][]): number[][] => {
  const scale = Math.cos((CENTRE[1] * Math.PI) / 180) * M
  const pts = corners.map(([x, y]) => [CENTRE[0] + x / scale, CENTRE[1] + y / M])
  return [...pts, pts[0]]
}

describe('Parking areas: archive recompute and recompute-failure toast with Retry (B139)', () => {
  let areaId: number

  beforeEach(() => {
    cy.login()
    cy.task('cleanParkedAircraft', [tailInside])
    cy.task('cleanParkingAreas', [code])
    const ring = ringFromMetres([
      [-35, -12],
      [32, -18],
      [38, 14],
      [-28, 20],
    ])
    cy.task('seedParkingArea', { code, name: `B139 ${code}`, ring }).then((id) => {
      areaId = id as number
    })
  })

  after(() => {
    cy.task('cleanParkedAircraft', [tailInside])
    cy.task('cleanParkingAreas', [code])
  })

  const seedPlane = (parkedAreaId: number | null) =>
    cy.task('seedParkedAircraft', {
      tail: tailInside,
      typeIcao: 'C172',
      typeDisplay: 'Cessna 172',
      lat: CENTRE[1],
      lng: CENTRE[0],
      heading: 90,
      areaId: parkedAreaId,
    })

  const openAreaInConfigMode = () => {
    cy.visit('/parking')
    cy.get('#config-mode').click()
    cy.contains('li', code).should('be.visible')
  }

  /** Fails aircraft PATCHes (the recompute's write) while `state.failing` is true. */
  const failAircraftWrites = () => {
    const state = { failing: true }
    cy.intercept('PATCH', '**/rest/v1/aircraft*', (req) => {
      if (state.failing) req.reply({ statusCode: 500, body: { message: 'boom', code: 'XX000' } })
      else req.continue()
    }).as('aircraftWrite')
    return state
  }

  it('archiving an area detaches the plane inside it', () => {
    seedPlane(areaId)
    cy.task('getParkedAreaId', tailInside).then((id) => expect(id).to.eq(areaId))

    openAreaInConfigMode()
    cy.get(`button[aria-label="Archive ${code}"]`).click()
    cy.contains('button', 'Archive').click()

    // A plain success shows the inline banner (only warnings and errors also toast).
    cy.contains(`${code} archived.`).should('be.visible')
    taskUntil<number | null>('getParkedAreaId', tailInside, (id) => expect(id, 'plane after archive').to.eq(null))
  })

  it('boundary saved but recompute failed: warns with Retry, and Retry fixes the plane', () => {
    seedPlane(null)
    const state = failAircraftWrites()

    openAreaInConfigMode()
    cy.contains('li', code).find('button[aria-pressed]').click()
    cy.contains('p', 'Changes save automatically').should('be.visible')
    cy.contains('button', 'Make rectangle').click()
    cy.wait('@aircraftWrite')

    const toast = () => cy.get('ol li[data-state="open"]')
    toast().contains('Boundary saved; plane areas could not be updated').should('be.visible')
    toast().should('not.contain', 'Could not save the boundary')
    cy.task('getParkedAreaId', tailInside).should('eq', null)

    // Lift the failure, then Retry re-runs only the recompute.
    cy.then(() => {
      state.failing = false
    })
    toast().contains('button', 'Retry').click()
    toast().contains('Plane areas updated.').should('be.visible')
    taskUntil<number | null>('getParkedAreaId', tailInside, (id) => expect(id, 'plane after retry').to.eq(areaId))
  })

  it('area archived but recompute failed: warns with Retry, and Retry fixes the plane', () => {
    seedPlane(areaId)
    const state = failAircraftWrites()

    openAreaInConfigMode()
    cy.get(`button[aria-label="Archive ${code}"]`).click()
    cy.contains('button', 'Archive').click()
    cy.wait('@aircraftWrite')

    const toast = () => cy.get('ol li[data-state="open"]')
    toast().contains('Area archived; plane areas could not be updated').should('be.visible')
    toast().should('not.contain', 'Could not archive')
    cy.task('getParkedAreaId', tailInside).then((id) => expect(id).to.eq(areaId))

    cy.then(() => {
      state.failing = false
    })
    toast().contains('button', 'Retry').click()
    toast().contains('Plane areas updated.').should('be.visible')
    taskUntil<number | null>('getParkedAreaId', tailInside, (id) => expect(id, 'plane after retry').to.eq(null))
  })
})
