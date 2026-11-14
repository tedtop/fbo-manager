import { taskUntil } from '../../support/task-poll'

// Cypress spec (B57): heading undo in the aircraft drawer, the plane icon size, the selected area row contrast and the
// dark/light look of the parking sheets.
const stamp = Date.now().toString(36).toUpperCase()
const tail = `NB57${stamp}`
const areaCode = `CYB57P${stamp}`
const CENTRE = { lng: -114.08587471583614, lat: 46.92183963008256 }

type Pose = { lat: number; lng: number; heading: number | null }
const ROSE = '[role="slider"][aria-label="Aircraft heading"]'

const savedHeading = (expected: number) =>
  taskUntil<Pose | null>('getParkedPose', tail, (pose) => {
    expect(pose, 'aircraft row').to.not.eq(null)
    expect(pose!.heading, 'saved heading').to.eq(expected)
  })

/** [r, g, b, a] of any CSS colour, normalised through a canvas so oklch() and friends come out as sRGB. */
function rgba(win: Cypress.AUTWindow, css: string): number[] {
  const ctx = win.document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  return Array.from(ctx.getImageData(0, 0, 1, 1).data)
}

const luminance = ([r, g, b]: number[]): number => {
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function openDrawer(theme: 'dark' | 'light' = 'dark') {
  cy.visit('/parking', { onBeforeLoad: (win) => win.localStorage.setItem('theme', theme) })
  cy.get(`.parking-plane[title^="${tail} "]`).click({ force: true })
  cy.get(ROSE).should('be.visible')
  cy.get(ROSE)
    .closest('[role="dialog"]')
    .should(($dialog) => expect($dialog[0].getAnimations(), 'drawer animations').to.have.length(0))
}

describe('Parking polish (B57)', () => {
  beforeEach(() => {
    cy.login()
    cy.task('cleanParkedAircraft', [tail])
    cy.task('cleanParkingAreas', [areaCode])
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
    cy.task('cleanParkingAreas', [areaCode])
  })

  it('Undo heading change is off until the heading changes, then restores the original heading and saves it', () => {
    openDrawer()
    cy.contains('button', 'Undo heading change').should('be.disabled')

    cy.get('button[aria-label="Face right"]').click()
    // Default map bearing is 40, so facing right on screen is true heading 130.
    cy.get(ROSE).should('have.attr', 'aria-valuenow', '130')
    savedHeading(130)
    cy.contains('button', 'Undo heading change (back to 200').should('be.enabled').click()

    cy.get(ROSE).should('have.attr', 'aria-valuenow', '200')
    savedHeading(200)
    cy.contains('button', 'Undo heading change').should('be.disabled')
  })

  it('the plane icon never drops below a readable size, even zoomed far out', () => {
    cy.visit('/parking')
    cy.get(`.parking-plane[title^="${tail} "] img`)
      .should('exist')
      .then(($img) => {
        const rect = $img[0].getBoundingClientRect()
        expect(Math.max(rect.width, rect.height), 'longer side in px').to.be.at.least(36)
      })
  })

  it('the selected area row keeps readable text in dark and light themes', () => {
    cy.task('seedParkingArea', {
      code: areaCode,
      name: `B57 area ${areaCode}`,
      ring: [
        [CENTRE.lng - 0.0004, CENTRE.lat - 0.0002],
        [CENTRE.lng + 0.0004, CENTRE.lat - 0.0002],
        [CENTRE.lng + 0.0004, CENTRE.lat + 0.0002],
        [CENTRE.lng - 0.0004, CENTRE.lat + 0.0002],
        [CENTRE.lng - 0.0004, CENTRE.lat - 0.0002],
      ],
    })
    for (const theme of ['dark', 'light'] as const) {
      cy.visit('/parking', { onBeforeLoad: (win) => win.localStorage.setItem('theme', theme) })
      cy.get('#config-mode').click()
      cy.contains('li', areaCode).find('button[aria-pressed]').click()
      cy.contains('li', areaCode)
        .find('button[aria-pressed="true"]')
        .contains('div', `B57 area ${areaCode}`)
        .then(($name) => {
          const win = $name[0].ownerDocument.defaultView as Cypress.AUTWindow
          const li = $name.closest('li')[0]
          const text = rgba(win, win.getComputedStyle($name[0]).color)
          const bg = rgba(win, win.getComputedStyle(li).backgroundColor)
          expect(contrast(text, bg), `${theme}: name text vs selected row`).to.be.at.least(4.5)
        })
    }
  })

  it('the aircraft sheet follows the theme: dark background in dark mode, light in light mode', () => {
    openDrawer('dark')
    cy.get(ROSE)
      .closest('[role="dialog"]')
      .then(($dialog) => {
        const win = $dialog[0].ownerDocument.defaultView as Cypress.AUTWindow
        expect(luminance(rgba(win, win.getComputedStyle($dialog[0]).backgroundColor)), 'dark sheet').to.be.lessThan(0.2)
      })
    openDrawer('light')
    cy.get(ROSE)
      .closest('[role="dialog"]')
      .then(($dialog) => {
        const win = $dialog[0].ownerDocument.defaultView as Cypress.AUTWindow
        expect(luminance(rgba(win, win.getComputedStyle($dialog[0]).backgroundColor)), 'light sheet').to.be.greaterThan(0.6)
      })
  })
})
