// Guard for B94: new migrations must never grant privileges to the logged-out `anon` role.

/** Migrations with a version up to and including this one are grandfathered (already applied). */
export const ANON_GRANT_CUTOFF_VERSION = '20261109000100'

/** Strip `-- line` and block comments from SQL (string literals are not special-cased). */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Returns each `grant ... to ... anon ...` statement found (whitespace-collapsed). */
export function findAnonGrants(sql: string): string[] {
  const hits: string[] = []
  for (const stmt of stripSqlComments(sql).split(';')) {
    const s = stmt.replace(/\s+/g, ' ').trim()
    if (!/^grant\s/i.test(s)) continue
    const m = /\sto\s(.*)$/i.exec(s)
    if (m && /(^|[\s,"])anon($|[\s,";])/i.test(m[1])) hits.push(s)
  }
  return hits
}

/** True when a migration filename's version is newer than the grandfathered cutoff. */
export function isPostCutoff(filename: string): boolean {
  const version = filename.split('_')[0]
  return /^\d+$/.test(version) && version > ANON_GRANT_CUTOFF_VERSION
}
