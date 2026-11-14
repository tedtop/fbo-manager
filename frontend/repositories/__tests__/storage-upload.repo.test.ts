import { afterEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'

// Regression guard for B143: when the local storage-api container image is older than the
// storage schema (mixed Supabase CLI versions), every upload failed with Postgres 42P10
// ("no unique or exclusion constraint matching the ON CONFLICT specification").
// Fix: `pnpm supabase:stop && pnpm supabase:start` with the pinned CLI (see README).
const db = createTestClient()
const BUCKET = 'scans'
const path = `zz_test/b143-${Date.now()}.txt`

afterEach(async () => {
  await db.storage.from(BUCKET).remove([path])
})

describe('local storage upload', () => {
  it('stores an object in the scans bucket and reads it back', async () => {
    const body = new Blob(['b143'], { type: 'text/plain' })
    const { error } = await db.storage.from(BUCKET).upload(path, body, { upsert: true })
    expect(error).toBeNull()

    const { data, error: dlError } = await db.storage.from(BUCKET).download(path)
    expect(dlError).toBeNull()
    expect(await data?.text()).toBe('b143')
  })

  it('upserts over an existing object (the ON CONFLICT path)', async () => {
    const first = await db.storage.from(BUCKET).upload(path, new Blob(['one']), { upsert: true })
    expect(first.error).toBeNull()
    const second = await db.storage.from(BUCKET).upload(path, new Blob(['two']), { upsert: true })
    expect(second.error).toBeNull()
  })
})
