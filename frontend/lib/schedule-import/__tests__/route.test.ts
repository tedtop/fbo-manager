import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/ocr/schedule-sheet/route'

// Validation paths only: every request here is rejected before the Anthropic client is created, so nothing
// touches the network. A placeholder key is set just to get past the "key configured" check.
function post(form: FormData) {
  return POST(new NextRequest('http://localhost/api/ocr/schedule-sheet', { method: 'POST', body: form }))
}

describe('POST /api/ocr/schedule-sheet validation', () => {
  const original = process.env.ANTHROPIC_API_KEY
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'placeholder-not-a-real-key'
  })
  afterEach(() => {
    if (original === undefined) Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY')
    else process.env.ANTHROPIC_API_KEY = original
  })

  it('500 when ANTHROPIC_API_KEY is missing', async () => {
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY')
    const res = await post(new FormData())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'ANTHROPIC_API_KEY not configured' })
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
    expect((await res.json()).error).toMatch(/image .* or PDF/)
  })

  it('400 on a body that is not form data', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/ocr/schedule-sheet', { method: 'POST', body: 'nope' })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid form data' })
  })
})
