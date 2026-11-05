import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ocr/schedule-sheet/route'

// The auth gate has its own tests (lib/supabase/__tests__/require-module.test.ts); these cases are about validation.
vi.mock('@/lib/supabase/require-module', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/require-module')>()),
  requireModule: async () => ({ ok: true, user: { id: 'test-user' } })
}))

// Validation paths only: every request here is rejected before any OCR engine runs, so nothing touches the network.
function post(form: FormData) {
  return POST(new NextRequest('http://localhost/api/ocr/schedule-sheet', { method: 'POST', body: form }))
}

describe('POST /api/ocr/schedule-sheet validation', () => {
  it('400 for a PDF (photos only for now)', async () => {
    const form = new FormData()
    form.append('file', new File(['x'], 'sheet.pdf', { type: 'application/pdf' }))
    const res = await post(form)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/PDF is not supported/)
  })

  it('400 when no file is provided', async () => {
    const res = await post(new FormData())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'No file provided' })
  })

  it('400 when any file is not an image or PDF', async () => {
    const form = new FormData()
    form.append('file', new File(['x'], 'ok.png', { type: 'image/png' }))
    form.append('file', new File(['x'], 'sheet.csv', { type: 'text/csv' }))
    const res = await post(form)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/must be an image/)
  })

  it('400 on a body that is not form data', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/ocr/schedule-sheet', { method: 'POST', body: 'nope' })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid form data' })
  })
})
