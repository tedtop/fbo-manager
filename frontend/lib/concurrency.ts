/**
 * Thrown by repository update functions when an optimistic-concurrency
 * compare-and-swap write matches zero rows — i.e. the record's `modified_at`
 * no longer matches what was loaded into the edit form, because someone else
 * saved a change in between.
 *
 * Callers should catch this specifically (not treat it as a generic write
 * failure) and offer the user a choice to reload the latest data or
 * overwrite anyway. See frontend/hooks/use-record-edit-session.ts.
 */
export class ConcurrencyConflictError extends Error {
  readonly table: string
  readonly recordId: string | number

  constructor(table: string, recordId: string | number) {
    super(`Concurrent edit conflict on ${table}:${recordId}`)
    this.name = 'ConcurrencyConflictError'
    this.table = table
    this.recordId = recordId
  }
}
