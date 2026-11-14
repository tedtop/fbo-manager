import { taskUntil } from '../../support/task-poll'

// Cypress spec (B57): saving an area boundary (a) recomputes aircraft.parked_area_id for planes that moved in or out of
// the shape, and (b) shows a toast. Driven through "Make rectangle" in config mode (one click, one saved polygon); every
// check ends in a direct DB read.
const stamp = Date.now().toString(36).toUpperCase()
const code = `CYB57${stamp}`
const tailInside = `NB57I${stamp}`
const tailFar = `NB57F${stamp}`

const M = 111_320
const CENTRE: [number, number] = [-114.08587471583614, 46.92183963008256]

/** A closed ring from metric corners (east, north) around the map's default centre. */
const ringFromMetres = (corners: [number, number][]): number[][] => {
  const scale = Math.cos((CENTRE[1] * Math.PI) / 180) * M
  const pts = corners.map(([x, y]) => [CENTRE[0] + x / scale, CENTRE[1] + y / M])
  return [...pts, pts[0]]
}

describe('Parking areas: boundary save refreshes planes and toasts (B57)', () => {
  let areaId: number

  beforeEach(() => {
    cy.login()
    cy.task('cleanParkedAircraft', [tailInside, tailFar])
    cy.task('cleanParkingAreas', [code])
    // A skewed quad around the map centre, so "Make rectangle" changes the polygon.
    const ring = ringFromMetres([
      [-35, -12],
      [32, -18],
      [38, 14],
      [-28, 20],
    ])
    cy.task('seedParkingArea', { code, name: `B57 ${code}`, ring }).then((id) => {
      areaId = id as number
      // Stale on purpose: the plane inside has no area stored, the far plane still claims this one.
      cy.task('seedParkedAircraft', {
        tail: tailInside,
        typeIcao: 'C172',
        typeDisplay: 'Cessna 172',
        lat: CENTRE[1],
        lng: CENTRE[0],
        heading: 90,
        areaId: null,
      })
      cy.task('seedParkedAircraft', {
        tail: tailFar,
        typeIcao: 'C172',
        typeDisplay: 'Cessna 172',
        lat: CENTRE[1] + 500 / M,
        lng: CENTRE[0],
        heading: 90,
        areaId,
      })
    })
  })

  after(() => {
    cy.task('cleanParkedAircraft', [tailInside, tailFar])
    cy.task('cleanParkingAreas', [code])
  })

  it('saving the boundary fixes both planes parked_area_id and shows a toast', () => {
    // Before the edit the stored ids are stale.
    cy.task('getParkedAreaId', tailInside).should('eq', null)
    cy.task('getParkedAreaId', tailFar).then((id) => expect(id).to.eq(areaId))

    cy.visit('/parking')
    cy.get('#config-mode').click()
    cy.contains('li', code).find('button[aria-pressed]').click()
    cy.contains('p', 'Changes save automatically').should('be.visible')
    cy.contains('button', 'Make rectangle').click()

    // The toast viewport shows the save (the inline banner says the same, so look only inside the toast list).
    cy.get('ol li[data-state="open"]').contains('Made a rectangle').should('be.visible')

    taskUntil<number | null>('getParkedAreaId', tailInside, (id) => expect(id, 'plane inside').to.eq(areaId))
    taskUntil<number | null>('getParkedAreaId', tailFar, (id) => expect(id, 'plane outside').to.eq(null))
  })

  it('a failed save shows an error toast and leaves the stored ids alone', () => {
    cy.intercept('PATCH', '**/rest/v1/parking_area*', { statusCode: 500, body: { message: 'boom', code: 'XX000' } }).as(
      'failedSave'
    )
    cy.visit('/parking')
    cy.get('#config-mode').click()
    cy.contains('li', code).find('button[aria-pressed]').click()
    cy.contains('p', 'Changes save automatically').should('be.visible')
    cy.contains('button', 'Make rectangle').click()
    cy.wait('@failedSave')

    cy.get('ol li[data-state="open"]').contains('Could not save the boundary').should('be.visible')
    cy.get('ol li[data-state="open"]').should('not.contain', 'Made a rectangle')
    cy.task('getParkedAreaId', tailInside).should('eq', null)
    cy.task('getParkedAreaId', tailFar).then((id) => expect(id).to.eq(areaId))
  })
})
