/**
 * Who recorded a training completion (B141). New completions are attributed to the signed-in account's
 * profile (`recorded_by_profile_id`); the legacy `users` link (`recorded_by_id`) only survives on completions
 * recorded before that column existed, and is filled alongside when the account happens to have a legacy row.
 */
export interface CompletionRecorderSource {
  recorded_by_profile?: { first_name: string; last_name: string } | null
  recorded_by?: { first_name: string; last_name: string; username: string } | null
}

function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim()
}

/** Display name of the recorder: the profile first, then the legacy user, else null (unattributed). */
export function completionRecorderName(c: CompletionRecorderSource): string | null {
  const p = c.recorded_by_profile
  if (p) {
    const name = fullName(p.first_name, p.last_name)
    if (name) return name
  }
  const u = c.recorded_by
  if (u) return fullName(u.first_name, u.last_name) || u.username || null
  return null
}

/**
 * True when a PostgREST error says the training_completion.recorded_by_profile_id column (or its embedded
 * relationship) does not exist yet, i.e. the B141 migration is not applied on this database. Lets the app keep
 * working before and after that migration.
 */
export function isMissingProfileAttributionColumn(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  const text = typeof message === 'string' ? message : ''
  if (!text.includes('recorded_by_profile')) return false
  return code === 'PGRST204' || code === 'PGRST200' || code === '42703' || code === 'PGRST100'
}
