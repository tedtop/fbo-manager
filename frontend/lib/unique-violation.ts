import { PG_UNIQUE_VIOLATION } from '@/lib/db-errors'

/**
 * True when a caught value is a Postgres unique-constraint violation. Supabase
 * returns a plain PostgrestError object (not an Error instance) with
 * code 23505, so check the code on any object first (also covers
 * ConstraintViolationError.sqlCode), then fall back to a duplicate/unique
 * message test on Error instances and plain objects with a string message.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { code, sqlCode, message } = err as {
    code?: unknown
    sqlCode?: unknown
    message?: unknown
  }
  if (code === PG_UNIQUE_VIOLATION || sqlCode === PG_UNIQUE_VIOLATION) return true
  return typeof message === 'string' && /duplicate|unique/i.test(message)
}
