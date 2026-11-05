// Port of e2e/api-auth.e2e.ts (Playwright). middleware.ts skips auth for every /api/ path, so each route checks for
// itself. These are the routes that spend money (OCR) or reach a third party (QT, registry lookup): an anonymous
// caller must get 401 before any body is read or any upstream is called.
// (No DB proof here: a rejected call persists nothing; the 401 status and body are the observable outcome.)
describe('API routes reject anonymous callers', () => {
  const routes: { method: 'GET' | 'POST'; path: string }[] = [
    { method: 'GET', path: '/api/qt/dispatch' },
    { method: 'GET', path: '/api/aircraft/lookup?tail=N868CB' },
    { method: 'POST', path: '/api/ocr/truck-sheet' },
    { method: 'POST', path: '/api/ocr/schedule-sheet' },
  ]

  for (const { method, path } of routes) {
    it(`${method} ${path} -> 401`, () => {
      // No cy.login(): cy.request carries only the (empty) cookie jar of this isolated test.
      cy.clearCookies()
      cy.request({ method, url: path, failOnStatusCode: false }).then((res) => {
        expect(res.status).to.eq(401)
        expect(res.body).to.deep.eq({ error: 'Not authenticated' })
      })
    })
  }
})

describe('API routes still serve a signed-in admin', () => {
  beforeEach(() => {
    cy.login()
  })

  it('aircraft lookup passes the gate (400 for a bad tail, not 401/403)', () => {
    cy.request({ url: '/api/aircraft/lookup?tail=!!', failOnStatusCode: false }).its('status').should('eq', 400)
  })

  it('OCR routes pass the gate (not 401/403)', () => {
    // Multipart with no file, sent by the signed-in browser itself (cy.request cannot build a multipart body).
    cy.visit('/')
    for (const path of ['/api/ocr/schedule-sheet', '/api/ocr/truck-sheet']) {
      cy.window()
        .then((win) => {
          const body = new win.FormData()
          body.append('note', 'no file')
          return win.fetch(path, { method: 'POST', body }).then((res) => res.status)
        })
        .then((status) => {
          // 400 for the missing file, or 500 if ANTHROPIC_API_KEY is unset locally: either way the gate let the admin through.
          expect([401, 403], path).to.not.include(status)
        })
    }
  })
})
