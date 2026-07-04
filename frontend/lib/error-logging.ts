import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A small, reusable observability primitive — NOT specific to any one
 * feature (invoicing happens to be its first caller; see lib/db-errors.ts).
 *
 * Why this exists: deployment is Docker on a VPS with no log aggregation
 * set up. Container stdout is ephemeral and not queryable after the
 * container recycles, so when a user reports "something went wrong" there
 * is currently no way to reconstruct what actually happened. app_error_log
 * (frontend/scripts/error-logging-schema.sql) is the durable record.
 *
 * Entries are deliberately structured/queryable — timestamp, category,
 * code, entity ids, user id — so a human (or, later, a support chatbot;
 * see docs/architecture/fuel-invoicing-workflow.md's future-phase note,
 * not built now) can reasonably ask "what happened around timestamp X for
 * user Y?" without grepping unstructured text.
 */

export type AppErrorLogRow = Tables<'app_error_log'>

/**
 * Coarse, stable bucket for grouping/querying — kept small on purpose.
 * Specifics belong in `code` and `source`, not in a growing category list.
 */
export type ErrorCategory =
  | 'db_constraint'
  | 'db_query'
  | 'network'
  | 'validation'
  | 'auth'
  | 'storage'
  | 'unknown'

export interface AppErrorLogInput {
  category: ErrorCategory
  /**
   * Short, stable machine code: a Postgres constraint name
   * ('uq_invoice_line_items_fuel_transaction'), a SQLSTATE ('23503'), or an
   * app-defined code for non-DB errors. Not shown to end users.
   */
  code: string
  /** Human-readable summary. May be the same friendly message shown to a user, but isn't required to be. */
  message: string
  /**
   * Full technical detail — raw error message, stack trace, Postgres
   * `details`/`hint`. NEVER surface this to end users; it exists purely so
   * a developer (or future support tool) can reconstruct what happened.
   */
  detail?: string | null
  /** Relevant entity ids, e.g. `{ invoice_id: 5, fuel_transaction_id: 12 }`. */
  context?: Record<string, unknown> | null
  /**
   * Acting user's id. When omitted, logAppError looks it up from
   * `db.auth.getUser()` — pass explicitly only if you already have it, or
   * if `db` is a service-role client with no user session to look up.
   */
  userId?: string | null
  /** Where in the code this was raised, e.g. `'invoices.repo.createInvoice'`. */
  source?: string | null
}

/**
 * Persists a structured error entry to `app_error_log` and always echoes it
 * to the console first, so local/dev visibility never depends on the
 * database write succeeding.
 *
 * Never throws: a logging failure must never break the caller's actual
 * error handling. Failures here are only ever reported to the console.
 */
export async function logAppError(
  db: SupabaseClient<Database>,
  input: AppErrorLogInput
): Promise<void> {
  const occurredAt = new Date().toISOString()

  console.error('[app-error]', {
    occurred_at: occurredAt,
    category: input.category,
    code: input.code,
    message: input.message,
    detail: input.detail ?? undefined,
    context: input.context ?? undefined,
    source: input.source ?? undefined
  })

  try {
    let userId = input.userId ?? null
    if (userId == null) {
      try {
        const { data } = await db.auth.getUser()
        userId = data.user?.id ?? null
      } catch {
        userId = null // e.g. a service-role client with no session — expected, not an error
      }
    }

    const entry: TablesInsert<'app_error_log'> = {
      occurred_at: occurredAt,
      category: input.category,
      error_code: input.code,
      message: input.message,
      detail: input.detail ?? null,
      context: input.context ?? null,
      user_id: userId,
      source: input.source ?? null
    }
    const { error } = await db.from('app_error_log').insert(entry)
    if (error) {
      console.error('[app-error] failed to persist log entry:', error)
    }
  } catch (err) {
    console.error('[app-error] failed to persist log entry (threw):', err)
  }
}
