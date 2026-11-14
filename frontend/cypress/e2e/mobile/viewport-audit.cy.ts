// B19c: every module at phone widths. The PAGE must not scroll sideways (wide tables scroll inside their own container),
// dialogs and sheets fit the viewport, and the primary nav/toolbar buttons are at least 44px tall.
const ROUTES = [
  { name: 'board', path: '/' },
  { name: 'fuel farm', path: '/fuel-farm' },
  { name: 'fuel dispatch', path: '/fuel-dispatch' },
  { name: 'parking', path: '/parking' },
  { name: 'truck sheets', path: '/truck-sheets' },
  { name: 'equipment', path: '/equipment' },
  { name: 'line schedule', path: '/line-schedule' },
  { name: 'users', path: '/users' },
  { name: 'settings', path: '/settings' },
  { name: 'docs index', path: '/docs' },
  { name: 'docs module', path: '/docs/flight-operations' }
]
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 }
]

const fitsViewport = (el: HTMLElement) => {
  const win = el.ownerDocument.defaultView as Window
  const r = el.getBoundingClientRect()
  expect(r.left, 'left').to.be.at.least(0)
  expect(r.top, 'top').to.be.at.least(0)
  expect(r.right, 'right').to.be.at.most(win.innerWidth)
  expect(r.bottom, 'bottom').to.be.at.most(win.innerHeight)
}

const hasScrollableContent = (root: HTMLElement) =>
  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].some(
    (el) => el.scrollHeight > el.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)
  )

describe('Mobile viewport audit (B19c)', () => {
  Cypress.on('uncaught:exception', (err) => !err.message.includes('ResizeObserver loop'))

  beforeEach(() => {
    // external calls (weather, map tiles) are stubbed so the pages are deterministic
    cy.intercept('GET', '/api/metar*', { body: {} })
    cy.intercept('GET', /openfreemap|basemaps|tiles\./, { statusCode: 204, body: '' })
    cy.login()
  })

  for (const vp of VIEWPORTS) {
    describe(`${vp.width}x${vp.height}`, () => {
      beforeEach(() => {
        cy.viewport(vp.width, vp.height)
      })

      for (const route of ROUTES) {
        it(`${route.name} has no horizontal page scroll`, () => {
          cy.visit(route.path)
          cy.get('nav').should('be.visible')
          cy.get('main', { timeout: 15_000 }).should('exist')
          cy.wait(800) // let client data settle so late-rendered wide content is counted
          cy.document().then((doc) => {
            expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(vp.width)
            expect(doc.body.scrollWidth, 'body scrollWidth').to.be.at.most(vp.width)
          })
        })
      }

      it('nav and board toolbar buttons are at least 44px tall', () => {
        cy.visit('/')
        for (const label of ['Open navigation menu', 'Account menu']) {
          cy.get(`button[aria-label="${label}"]`).should(($b) => {
            const r = $b[0].getBoundingClientRect()
            expect(r.height, `${label} height`).to.be.at.least(44)
            expect(r.width, `${label} width`).to.be.at.least(44)
          })
        }
        cy.get('button[aria-label^="Switch to"]').should(($b) => {
          expect($b[0].getBoundingClientRect().height, 'theme toggle').to.be.at.least(44)
        })
        cy.contains('button', 'Add Flight').should(($b) => {
          expect($b[0].getBoundingClientRect().height, 'Add Flight').to.be.at.least(44)
        })
        cy.get('button[title="Split View"]').should(($b) => {
          expect($b[0].getBoundingClientRect().height, 'view toggle').to.be.at.least(44)
        })
      })

      it('the Add Flight sheet fits the viewport and its content scrolls', () => {
        cy.visit('/')
        cy.contains('button', 'Add Flight').click()
        cy.contains('h2', 'Add New Flight').should('be.visible')
        // the sheet slides in: retried until it has settled
        cy.get('[role="dialog"]').should(($d) => fitsViewport($d[0]))
        cy.get('[role="dialog"]').then(($d) => {
          expect(hasScrollableContent($d[0]), 'scrollable container inside the sheet').to.eq(true)
        })
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth, 'page scrollWidth with sheet open').to.be.at.most(vp.width)
        })
      })

      it('submitting the flight form without a tail shows the validation message inside the viewport', () => {
        cy.visit('/')
        cy.contains('button', 'Add Flight').click()
        cy.contains('h2', 'Add New Flight').should('be.visible')
        cy.get('#arrivalTime').type('13:15')
        cy.get('[role="dialog"]').contains('button', 'Add Flight').scrollIntoView().click()
        cy.contains('Enter the tail number')
          .scrollIntoView()
          .should('be.visible')
          .then(($m) => {
            const r = $m[0].getBoundingClientRect()
            expect(r.left, 'message left').to.be.at.least(0)
            expect(r.right, 'message right').to.be.at.most(vp.width)
            expect(r.bottom, 'message bottom').to.be.at.most(vp.height)
          })
        cy.contains('h2', 'Add New Flight').should('be.visible') // nothing was created, the sheet stays open
      })

      it('the Add Equipment dialog fits the viewport', () => {
        cy.visit('/equipment')
        cy.contains('button', 'Add Equipment', { timeout: 15_000 }).click()
        cy.get('[role="dialog"]').should(($d) => fitsViewport($d[0]))
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth, 'page scrollWidth with dialog open').to.be.at.most(vp.width)
        })
      })
    })
  }
})
