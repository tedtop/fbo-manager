import type { Database } from '@/types/database'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { type ErrorCategory, logAppError } from './error-logging'

/** Postgres SQLSTATE codes for the constraint violations PostgREST passes through as-is. */
export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'
export const PG_CHECK_VIOLATION = '23514'

const CONSTRAINT_VIOLATION_CODES: ReadonlySet<string> = new Set([
  PG_UNIQUE_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_CHECK_VIOLATION
])

export function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  )
}

function pgConstraintName(err: PostgrestError): string | null {
  const match = err.message.match(/constraint "([^"]+)"/)
  return match ? match[1] : null
}

/**
 * Thrown when a repository write is rejected by a database constraint
 * (unique / foreign key / check) that the caller should present to the
 * user as a clear, actionable message instead of a raw Postgres error
 * string. `.message` is safe to show a user; the original PostgrestError is
 * kept on `.cause` for anything that wants the raw detail. Mirrors the
 * existing ConcurrencyConflictError pattern (lib/concurrency.ts) — catch
 * this specifically rather than treating it as a generic write failure.
 */
export class ConstraintViolationError extends Error {
  readonly sqlCode: string
  readonly constraintName: string | null

  constructor(
    message: string,
    sqlCode: string,
    constraintName: string | null,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ConstraintViolationError'
    this.sqlCode = sqlCode
    this.constraintName = constraintName
  }
}

/**
 * Friendly messages for constraints a normal user action could plausibly
 * hit. Add an entry here whenever a new UNIQUE/FK/CHECK constraint is
 * introduced that isn't purely a programmer-error case — see
 * docs/architecture/fuel-invoicing-workflow.md for where these two come
 * from (the fuel_transaction ↔ invoicing linkage).
 */
const FRIENDLY_CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_invoice_line_items_fuel_transaction:
    'This fueling has already been added to another invoice.',
  uq_invoice_line_items_meter_reading:
    'This fueling event has already been added to another invoice.',
  invoice_line_items_fuel_transaction_id_fkey:
    'This fueling has already been billed to an invoice — void the invoice before deleting it.'
}

const DEFAULT_FALLBACK_MESSAGE =
  'This action conflicts with existing data and could not be completed.'

function translateConstraintViolation(
  err: PostgrestError,
  fallback: string
): ConstraintViolationError | null {
  if (!CONSTRAINT_VIOLATION_CODES.has(err.code)) return null
  const constraintName = pgConstraintName(err)
  const message =
    (constraintName && FRIENDLY_CONSTRAINT_MESSAGES[constraintName]) ||
    fallback
  return new ConstraintViolationError(message, err.code, constraintName, {
    cause: err
  })
}

/**
 * Handles a failed repository write: logs the raw Postgres error (the first
 * real usage of lib/error-logging.ts) and throws a user-safe error —
 * ConstraintViolationError with a friendly `.message` when the failure is a
 * known constraint violation, otherwise the original PostgrestError
 * unchanged (so unrelated failures aren't silently mislabeled).
 *
 * Always throws; callers should invoke this from inside an `if (error) { ... }`
 * branch right after a Supabase write, e.g.:
 *
 *   if (error) {
 *     await handleWriteError(db, error, { source: 'x.repo.y', context: { id } })
 *   }
 */
export async function handleWriteError(
  db: SupabaseClient<Database>,
  err: PostgrestError,
  opts: {
    source: string
    context?: Record<string, unknown> | null
    fallbackMessage?: string
  }
): Promise<never> {
  const translated = translateConstraintViolation(
    err,
    opts.fallbackMessage ?? DEFAULT_FALLBACK_MESSAGE
  )
  const category: ErrorCategory = translated ? 'db_constraint' : 'db_query'

  await logAppError(db, {
    category,
    code: translated?.constraintName ?? err.code ?? 'unknown',
    message: translated?.message ?? err.message,
    detail: `[${err.code}] ${err.message}${err.details ? ` — ${err.details}` : ''}${
      err.hint ? ` (hint: ${err.hint})` : ''
    }`,
    context: opts.context ?? null,
    source: opts.source
  })

  throw translated ?? err
}
