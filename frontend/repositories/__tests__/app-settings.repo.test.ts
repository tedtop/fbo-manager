import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestClient, TEST_ANON_KEY, TEST_SUPABASE_URL } from '@/tests/support/client'
import {
  findAllAppSettings,
  upsertAppSetting,
} from '@/repositories/app-settings.repo'

const db = createTestClient()
const TEST_KEY = 'zz_test_setting'

afterEach(async () => {
  await db.from('app_setting').delete().eq('key', TEST_KEY)
})

describe('app-settings.repo', () => {
  it('has the seeded tail_number_prefix', async () => {
    const rows = await findAllAppSettings(db)
    expect(rows.find((r) => r.key === 'tail_number_prefix')).toBeDefined()
  })

  it('inserts a new key, then updates it in place', async () => {
    const created = await upsertAppSetting(db, TEST_KEY, 'one')
    expect(created.value).toBe('one')

    const updated = await upsertAppSetting(db, TEST_KEY, 'two')
    expect(updated.value).toBe('two')

    const rows = (await findAllAppSettings(db)).filter((r) => r.key === TEST_KEY)
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe('two')
  })

  it('refreshes updated_at when a value changes', async () => {
    const first = await upsertAppSetting(db, TEST_KEY, 'one')
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await upsertAppSetting(db, TEST_KEY, 'two')
    expect(new Date(second.updated_at).getTime()).toBeGreaterThan(
      new Date(first.updated_at).getTime()
    )
  })

  it('rejects a key that is not lower snake case', async () => {
    await expect(upsertAppSetting(db, 'Bad Key', 'x')).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('is not readable or writable by anon', async () => {
    const anon = createClient(TEST_SUPABASE_URL, TEST_ANON_KEY)
    const read = await anon.from('app_setting').select('*')
    expect(read.error).not.toBeNull()
    const write = await anon.from('app_setting').upsert({ key: TEST_KEY, value: 'x' })
    expect(write.error).not.toBeNull()
  })
})
