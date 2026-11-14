import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildScheduleSheetRow, describeScanError, saveScheduleSheetOriginals } from '@/repositories/scanned-documents.repo'

const file = (name: string, n = 1) => new File([new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9])], name, { type: 'image/jpeg' })

function fakeDb(
  upload: (path: string) => { error: { message: string; statusCode?: string } | null },
  insert: (row: Record<string, unknown>) => { error: { message: string; code?: string } | null } = () => ({ error: null })
) {
  const calls: string[] = []
  const rows: Record<string, unknown>[] = []
  const db = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        expect(table).toBe('scanned_documents')
        rows.push(row)
        return insert(row)
      }
    }),
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
  return { db, calls, rows }
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

  it('records a scanned_documents row (doc_type schedule_sheet) for the stored object', async () => {
    const { db, calls, rows } = fakeDb(() => ({ error: null }))
    expect(await saveScheduleSheetOriginals(db, [file('a.jpg')], '2026-11-04')).toBeNull()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      doc_type: 'schedule_sheet',
      storage_bucket: 'scans',
      storage_path: calls[0],
      original_path: calls[0],
      original_filename: 'a.jpg',
      content_type: 'image/jpeg',
      byte_size: 5,
      original_content_type: 'image/jpeg',
      scan_date: '2026-11-04'
    })
    expect(rows[0].content_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a duplicate row (same sheet scanned again) counts as stored', async () => {
    const { db } = fakeDb(
      () => ({ error: { message: 'exists', statusCode: '409' } }),
      () => ({ error: { message: 'duplicate key', code: '23505' } })
    )
    expect(await saveScheduleSheetOriginals(db, [file('a.jpg')], '2026-11-04')).toBeNull()
  })

  it('a failed row insert is returned with the underlying database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb(
      () => ({ error: null }),
      () => ({ error: { message: 'violates check constraint "scanned_documents_doc_type_check"', code: '23514' } })
    )
    expect(await saveScheduleSheetOriginals(db, [file('a.jpg')], '2026-11-04')).toBe(
      'violates check constraint "scanned_documents_doc_type_check" (23514)'
    )
  })
})

describe('buildScheduleSheetRow / describeScanError', () => {
  it('leaves scan_date null when the sheet date is unknown and defaults the content type', () => {
    const row = buildScheduleSheetRow({ path: 'p', file: { name: 'x', type: '', size: 3 }, sha256: 'h' })
    expect(row).toMatchObject({ scan_date: null, content_type: 'application/octet-stream', original_content_type: null })
  })

  it('formats plain error objects', () => {
    expect(describeScanError({ message: 'm', details: 'd', hint: 'h', code: '42501' })).toBe('m - d - h (42501)')
    expect(describeScanError(new Error('boom'))).toBe('boom')
    expect(describeScanError('x')).toBe('x')
  })
})
