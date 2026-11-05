import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ocr/truck-sheet/route'

const gate = vi.hoisted(() => ({ result: { ok: true, user: { id: 'u' } } as unknown }))
vi.mock('@/lib/supabase/require-module', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/require-module')>()),
  requireModule: async () => gate.result
}))

function post(form: FormData | string) {
  return POST(new NextRequest('http://localhost/api/ocr/truck-sheet', { method: 'POST', body: form }))
}
const photo = () => {
  const f = new FormData()
  f.append('file', new File([new Uint8Array([1, 2, 3])], 'sheet.jpg', { type: 'image/jpeg' }))
  return f
}

beforeEach(() => {
  gate.result = { ok: true, user: { id: 'u' } }
  vi.stubEnv('SCHEDULE_OCR_ALLOW_CLAUDE', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/ocr/truck-sheet', () => {
  it('is gated by the truck_sheets module check', async () => {
    gate.result = { ok: false, status: 401, error: 'Not authenticated' }
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'k')
    const res = await post(photo())
    expect(res.status).toBe(401)
  })

  it('503 with a clear message when no Vision key is configured (and Claude is not enabled)', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', '')
    const res = await post(photo())
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/GOOGLE_VISION_API_KEY/)
  })

  it('does not fall back to Claude just because an Anthropic key exists', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    expect((await post(photo())).status).toBe(503)
  })

  it('400 for a PDF (photos only) and for other file types, and when no file is sent', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'k')
    const pdf = new FormData()
    pdf.append('file', new File(['x'], 'a.pdf', { type: 'application/pdf' }))
    const r1 = await post(pdf)
    expect(r1.status).toBe(400)
    expect((await r1.json()).error).toMatch(/PDF is not supported/)
    const csv = new FormData()
    csv.append('file', new File(['x'], 'a.csv', { type: 'text/csv' }))
    expect((await post(csv)).status).toBe(400)
    expect((await post(new FormData())).status).toBe(400)
    expect((await post('nope')).status).toBe(400)
  })

  it('400 for an image that cannot be decoded, without calling Vision', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'k')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const res = await post(photo())
    expect(res.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('502 when Vision fails, and the key is never in the response', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'secret-key-value')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    const f = new FormData()
    f.append('file', new File([new Uint8Array(jpeg)], 'sheet.jpg', { type: 'image/jpeg' }))
    const res = await post(f)
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('secret-key-value')
  })

  it('returns an ExtractedTruckSheet (empty readings for a page with no table)', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ responses: [{}] }), { status: 200 })))
    const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    const f = new FormData()
    f.append('file', new File([new Uint8Array(jpeg)], 'sheet.jpg', { type: 'image/jpeg' }))
    const res = await post(f)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ truck_number: '', readings: [], sheet_date: null })
  })
})
