import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ocr/schedule-sheet/route'

// The OCR route spends quota, so it must refuse before touching the body when the gate says no.
vi.mock('@/lib/supabase/require-module', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/require-module')>()),
  requireModule: async (module: string) => {
    expect(module).toBe('flight_operations')
    return { ok: false, status: 401, error: 'Not authenticated' }
  }
}))

describe('POST /api/ocr/schedule-sheet auth', () => {
  it('401 without a signed-in user, before any file is read', async () => {
    const form = new FormData()
    form.append('file', new File(['x'], 'a.png', { type: 'image/png' }))
    const res = await POST(new NextRequest('http://localhost/api/ocr/schedule-sheet', { method: 'POST', body: form }))
    expect(res.status).toBe(401)
  })
})
