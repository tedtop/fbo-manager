import { taskUntil } from '../../support/task-poll'

// Cypress spec (B105): the compass rose in the aircraft drawer on /parking. Real pointer events on the rose, on a map
// turned 40 degrees (the app's default bearing); every check ends in a direct DB read of aircraft.parked_heading.
// The map instance comes from window.__parkingMap, a seam use-map-instance.ts sets only when window.Cypress exists.
const stamp = Date.now().toString(36).toUpperCase()
const tail = `NB105${stamp}`
const CENTRE = { lng: -114.08587471583614, lat: 46.92183963008256 }

type Pose = { lat: number; lng: number; heading: number | null }
type MapLike = { getBearing(): number; setBearing(bearing: number): void; isMoving(): boolean }
const mapOf = (win: Cypress.AUTWindow): MapLike => (win as unknown as { __parkingMap: MapLike }).__parkingMap

const ROSE = '[role="slider"][aria-label="Aircraft heading"]'
/** Distance from the rose centre of the clicks below, in px (the rose is at least 100 px wide, radius 50). */
const REACH = 40

const savedPose = (check: (pose: Pose) => void) =>
  taskUntil<Pose | null>('getParkedPose', tail, (pose) => {
    expect(pose, 'aircraft row').to.not.eq(null)
    check(pose!)
  })

/**
 * A pointer press and release on the rose, `dx`/`dy` px from its centre (right and down positive). The PointerEvents are
 * dispatched with the exact client position: cy.trigger rounds to whole pixels, and a pixel is more than a degree here.
 */
function pressRose(dx: number, dy: number) {
  cy.get(ROSE).then(($rose) => {
    const rose = $rose[0]
    const win = rose.ownerDocument.defaultView as Window & typeof globalThis
    const rect = rose.getBoundingClientRect()
    const init = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientX: rect.left + rect.width / 2 + dx,
      clientY: rect.top + rect.height / 2 + dy,
    }
    rose.dispatchEvent(new win.PointerEvent('pointerdown', { ...init, buttons: 1 }))
    rose.dispatchEvent(new win.PointerEvent('pointerup', { ...init, buttons: 0 }))
  })
}

/** Opens /parking, turns the map to `bearing` and opens the drawer of the seeded plane. */
function openDrawer(bearing: number) {
  cy.visit('/parking')
  cy.window().should((win) => expect(mapOf(win), 'map ready').to.exist)
  cy.window().then((win) => mapOf(win).setBearing(bearing))
  cy.window().should((win) => {
    expect(mapOf(win).getBearing(), 'map rotation').to.be.closeTo(bearing, 0.5)
    expect(mapOf(win).isMoving(), 'map has settled').to.eq(false)
  })
  cy.get(`.parking-plane[title^="${tail} "]`).click({ force: true })
  cy.get(ROSE).should('be.visible')
  // The drawer slides in: clicks are computed from the rose's position, so wait until it stopped moving.
  cy.get(ROSE)
    .closest('[role="dialog"]')
    .should(($dialog) => expect($dialog[0].getAnimations(), 'drawer animations').to.have.length(0))
}

describe('Parking: compass rose for the aircraft heading (B105)', () => {
  beforeEach(() => {
    cy.login()
    cy.task('cleanParkedAircraft', [tail])
    cy.task('seedParkedAircraft', {
      tail,
      typeIcao: 'C172',
      typeDisplay: 'Cessna 172',
      lat: CENTRE.lat,
      lng: CENTRE.lng,
      heading: 200,
    })
  })

  after(() => {
    cy.task('cleanParkedAircraft', [tail])
  })

  it('a click on the rose is a heading relative to the rotated map: up is the map bearing, right is 90 more', () => {
    openDrawer(40)
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '200')

    // Straight up the rose is straight up the screen: true heading = the map bearing.
    pressRose(0, -REACH)
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '40')
    savedPose((pose) => expect(pose.heading, 'saved heading, click up').to.eq(40))

    // To the right: 90 degrees clockwise of that.
    pressRose(REACH, 0)
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '130')
    savedPose((pose) => expect(pose.heading, 'saved heading, click right').to.eq(130))

    // Down-left diagonal: screen angle 225 + 40.
    pressRose(-REACH, REACH)
    savedPose((pose) => expect(pose.heading, 'saved heading, click down-left').to.eq(265))
  })

  it('follows a change of the map rotation while the drawer is open', () => {
    openDrawer(40)
    // North is at the left of the rose when the map is turned 90 degrees: N up on screen is then east.
    cy.window().then((win) => mapOf(win).setBearing(90))
    cy.window().should((win) => expect(mapOf(win).getBearing()).to.be.closeTo(90, 0.5))
    // The rose has redrawn for the new rotation: a plane at 200 degrees is at screen angle 110.
    cy.get('[data-testid="compass-plane"]').should('have.attr', 'transform', 'rotate(110)')
    pressRose(REACH, 0)
    savedPose((pose) => expect(pose.heading, 'right of a map turned 90').to.eq(180))
  })

  it('the Face up button still sets the heading to the map bearing', () => {
    openDrawer(40)
    cy.get('button[aria-label="Face right"]').click()
    savedPose((pose) => expect(pose.heading, 'face right').to.eq(130))
    cy.get('button[aria-label="Face up"]').click()
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '40')
    savedPose((pose) => expect(pose.heading, 'face up').to.eq(40))
  })

  it('arrow keys on the focused rose turn the plane by 1 degree and do not also move it on the map', () => {
    openDrawer(40)
    let before: Pose
    savedPose((pose) => {
      before = pose
    })
    cy.get(ROSE).focus().type('{rightarrow}')
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '201')
    savedPose((pose) => expect(pose.heading, 'after Right').to.eq(201))

    // Up would also drive the plane forward if the map-level key handler saw it too.
    cy.get(ROSE).type('{uparrow}{uparrow}{downarrow}')
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '202')
    savedPose((pose) => {
      expect(pose.heading, 'after Up Up Down').to.eq(202)
      expect(pose.lat, 'plane did not move').to.eq(before.lat)
      expect(pose.lng, 'plane did not move').to.eq(before.lng)
    })

    // Shift turns by 10 degrees.
    cy.get(ROSE).type('{shift}{leftarrow}')
    savedPose((pose) => expect(pose.heading, 'after Shift+Left').to.eq(192))
  })
})
