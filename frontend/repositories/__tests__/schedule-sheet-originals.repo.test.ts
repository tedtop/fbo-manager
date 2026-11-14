import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { saveScheduleSheetOriginals } from '@/repositories/scanned-documents.repo'

const file = (name: string, n = 1) => new File([new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9])], name, { type: 'image/jpeg' })

function fakeDb(upload: (path: string) => { error: { message: string; statusCode?: string } | null }) {
  const calls: string[] = []
  const db = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          expect(bucket).toBe('scans')
          calls.push(path)
          return upload(path)
        }
      })
    }
  } as unknown as SupabaseClient<Database>
  return { db, calls }
}

describe('saveScheduleSheetOriginals (B104)', () => {
  it('returns null when every file is stored, under schedule_sheet/<date>/original/', async () => {
    const { db, calls } = fakeDb(() => ({ error: null }))
    expect(await saveScheduleSheetOriginals(db, [file('a.jpg')], '2026-11-04')).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^schedule_sheet\/2026\/11\/2026-11-04\/original\/2026-11-04_schedule_scan-[0-9a-f]{8}\.jpg$/)
  })

  it('treats an already-stored object (same bytes) as success', async () => {
    const { db } = fakeDb(() => ({ error: { message: 'The resource already exists', statusCode: '409' } }))
    expect(await saveScheduleSheetOriginals(db, [file('a.jpg')], '2026-11-04')).toBeNull()
  })

  it('does not throw on an RLS error and returns the reason', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb(() => ({ error: Object.assign(new Error('new row violates row-level security policy'), { statusCode: '403' }) }))
    expect(await saveScheduleSheetOriginals(db, [file('a.jpg')], '2026-11-04')).toBe('new row violates row-level security policy')
  })

  it('names the files that failed when there are several', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let n = 0
    const { db } = fakeDb(() => (n++ === 0 ? { error: null } : { error: Object.assign(new Error('boom'), { statusCode: '500' }) }))
    expect(await saveScheduleSheetOriginals(db, [file('p1.jpg', 1), file('p2.jpg', 2)], null)).toBe('p2.jpg: boom')
  })
})
