import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { logAppError } from '@/lib/error-logging'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('error-logging', () => {
  it('persists a full structured entry', async () => {
    await logAppError(db, {
      category: 'db_constraint',
      code: 'some_constraint',
      message: 'Friendly message',
      detail: '[23505] raw postgres detail',
      context: { invoice_id: 5, fuel_transaction_id: 12 },
      source: 'test.someFunction'
    })

    const { data } = await db.from('app_error_log').select('*')
    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({
      category: 'db_constraint',
      error_code: 'some_constraint',
      message: 'Friendly message',
      detail: '[23505] raw postgres detail',
      source: 'test.someFunction'
    })
    expect(data?.[0].context).toEqual({ invoice_id: 5, fuel_transaction_id: 12 })
    expect(data?.[0].occurred_at).toBeTruthy()
    // service-role test client has no user session — auto-derived userId is null
    expect(data?.[0].user_id).toBeNull()
  })

  it('uses an explicitly passed userId over auto-derivation', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000001'
    await logAppError(db, {
      category: 'unknown',
      code: 'x',
      message: 'x',
      userId: fakeUserId
    })
    const { data } = await db.from('app_error_log').select('user_id')
    expect(data?.[0].user_id).toBe(fakeUserId)
  })

  it('never throws even when the persistence write itself fails', async () => {
    // an invalid UUID for user_id makes the insert fail at the DB level;
    // logAppError must swallow that (and only report it to the console),
    // never propagate it to the caller.
    await expect(
      logAppError(db, {
        category: 'unknown',
        code: 'test',
        message: 'test message',
        userId: 'not-a-valid-uuid'
      })
    ).resolves.toBeUndefined()

    const { data } = await db.from('app_error_log').select('*')
    expect(data).toHaveLength(0) // the failed insert did not persist anything
  })

  it('defaults context and detail to null when omitted', async () => {
    await logAppError(db, {
      category: 'validation',
      code: 'missing_field',
      message: 'Something was missing'
    })
    const { data } = await db.from('app_error_log').select('*').single()
    expect(data?.detail).toBeNull()
    expect(data?.context).toBeNull()
    expect(data?.source).toBeNull()
  })
})
