import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import {
  ConstraintViolationError,
  handleWriteError,
  isPostgrestError,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION
} from '@/lib/db-errors'
import type { PostgrestError } from '@supabase/supabase-js'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

/**
 * The two constraint violations this PR actually introduces (double-billing
 * and the billed-transaction delete RESTRICT) are exercised end-to-end,
 * against the real schema, in
 * repositories/__tests__/fuel-invoicing-workflow.repo.test.ts. These tests
 * cover the module's own translation logic — fallback behavior, unmapped
 * constraints, and non-constraint passthrough — with synthetic
 * PostgrestError-shaped objects, matching the real shape PostgREST returns.
 */
function fakePgError(overrides: Partial<PostgrestError> = {}): PostgrestError {
  const base = {
    message: 'duplicate key value violates unique constraint "some_constraint"',
    details: 'Key (x)=(1) already exists.',
    hint: '',
    code: PG_UNIQUE_VIOLATION,
    name: 'PostgrestError',
    ...overrides
  }
  return {
    ...base,
    toJSON: () => ({ ...base })
  }
}

describe('isPostgrestError', () => {
  it('recognizes a real PostgrestError shape', () => {
    expect(isPostgrestError(fakePgError())).toBe(true)
  })

  it('rejects plain Errors and non-error values', () => {
    expect(isPostgrestError(new Error('boom'))).toBe(false)
    expect(isPostgrestError(null)).toBe(false)
    expect(isPostgrestError('a string')).toBe(false)
    expect(isPostgrestError({ code: '23505' })).toBe(false) // no message
  })
})

describe('handleWriteError', () => {
  it('translates a known constraint into its mapped friendly message', async () => {
    const err = fakePgError({
      message: 'duplicate key value violates unique constraint "uq_invoice_line_items_fuel_transaction"'
    })
    await expect(
      handleWriteError(db, err, { source: 'test.known' })
    ).rejects.toMatchObject({
      name: 'ConstraintViolationError',
      sqlCode: PG_UNIQUE_VIOLATION,
      constraintName: 'uq_invoice_line_items_fuel_transaction',
      message: 'This fueling has already been added to another invoice.'
    })
  })

  it('falls back to the default message for an unmapped constraint', async () => {
    const err = fakePgError({
      message: 'duplicate key value violates unique constraint "some_other_unmapped_constraint"'
    })
    await expect(
      handleWriteError(db, err, { source: 'test.unmapped' })
    ).rejects.toMatchObject({
      name: 'ConstraintViolationError',
      constraintName: 'some_other_unmapped_constraint',
      message: 'This action conflicts with existing data and could not be completed.'
    })
  })

  it('honors a caller-supplied fallback message', async () => {
    const err = fakePgError({
      message: 'duplicate key value violates unique constraint "some_other_unmapped_constraint"'
    })
    await expect(
      handleWriteError(db, err, {
        source: 'test.customFallback',
        fallbackMessage: 'Custom fallback message.'
      })
    ).rejects.toMatchObject({ message: 'Custom fallback message.' })
  })

  it('recognizes foreign-key and check violations too, not just unique', async () => {
    await expect(
      handleWriteError(db, fakePgError({ code: PG_FOREIGN_KEY_VIOLATION }), {
        source: 'test.fk'
      })
    ).rejects.toBeInstanceOf(ConstraintViolationError)

    await expect(
      handleWriteError(db, fakePgError({ code: PG_CHECK_VIOLATION }), {
        source: 'test.check'
      })
    ).rejects.toBeInstanceOf(ConstraintViolationError)
  })

  it('passes through unrelated Postgres errors unchanged (not a constraint violation)', async () => {
    const notNullErr = fakePgError({
      code: '23502',
      message: 'null value in column "x" violates not-null constraint'
    })
    await expect(
      handleWriteError(db, notNullErr, { source: 'test.notNull' })
    ).rejects.toBe(notNullErr)
  })

  it('logs every handled error to app_error_log, categorized correctly', async () => {
    await handleWriteError(
      db,
      fakePgError({
        message: 'duplicate key value violates unique constraint "uq_invoice_line_items_fuel_transaction"'
      }),
      { source: 'test.logged', context: { invoice_id: 99 } }
    ).catch(() => {})

    await handleWriteError(db, fakePgError({ code: '23502', message: 'not null violation' }), {
      source: 'test.loggedNonConstraint'
    }).catch(() => {})

    const { data } = await db.from('app_error_log').select('*').order('id')
    expect(data).toHaveLength(2)
    expect(data?.[0]).toMatchObject({
      category: 'db_constraint',
      error_code: 'uq_invoice_line_items_fuel_transaction',
      source: 'test.logged'
    })
    expect(data?.[0].context).toEqual({ invoice_id: 99 })
    expect(data?.[1]).toMatchObject({
      category: 'db_query',
      error_code: '23502',
      source: 'test.loggedNonConstraint'
    })
  })
})
