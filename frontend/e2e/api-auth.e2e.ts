import { expect, test } from '@playwright/test'

/**
 * middleware.ts skips auth for every /api/ path, so each route checks for itself. These are the routes
 * that spend money (OCR) or reach a third party (QT, registry lookup): an anonymous caller must get 401
 * before any body is read or any upstream is called.
 */
test.describe('API routes reject anonymous callers', () => {
  // Drop the admin session the project applies by default.
  test.use({ storageState: { cookies: [], origins: [] } })

  const routes: { method: 'GET' | 'POST'; path: string }[] = [
    { method: 'GET', path: '/api/qt/dispatch' },
    { method: 'GET', path: '/api/aircraft/lookup?tail=N868CB' },
    { method: 'POST', path: '/api/ocr/truck-sheet' },
    { method: 'POST', path: '/api/ocr/schedule-sheet' }
  ]

  for (const { method, path } of routes) {
    test(`${method} ${path} -> 401`, async ({ request }) => {
      const res = await request.fetch(path, { method })
      expect(res.status()).toBe(401)
      expect(await res.json()).toEqual({ error: 'Not authenticated' })
    })
  }
})

test.describe('API routes still serve a signed-in admin', () => {
  test('aircraft lookup passes the gate (400 for a bad tail, not 401/403)', async ({ request }) => {
    const res = await request.get('/api/aircraft/lookup?tail=!!')
    expect(res.status()).toBe(400)
  })

  test('OCR routes pass the gate (not 401/403)', async ({ request }) => {
    for (const path of ['/api/ocr/schedule-sheet', '/api/ocr/truck-sheet']) {
      const res = await request.post(path, { multipart: { note: 'no file' } })
      // 400 for the missing file, or 500 if ANTHROPIC_API_KEY is unset locally: either way the gate let the admin through.
      expect([401, 403], path).not.toContain(res.status())
    }
  })
})
