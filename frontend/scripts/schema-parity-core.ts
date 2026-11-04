// Pure compare/normalise logic for scripts/schema-parity.ts (no DB access here).

export interface ColumnInfo {
  table: string
  column: string
  dataType: string
  isNullable: boolean
  columnDefault: string | null
}

export interface ConstraintInfo {
  table: string
  name: string
  kind: 'check' | 'foreign_key'
  definition: string
}

export interface SchemaSnapshot {
  tables: string[]
  columns: ColumnInfo[]
  constraints: ConstraintInfo[]
}

export interface AllowEntry {
  key: string
  reason: string
}

export interface Difference {
  /** Stable key, e.g. `flight.created_by_id:column_default`. Used by the allow-list. */
  key: string
  message: string
}

const CAST_RE =
  /::\s*(?:character varying|bit varying|double precision|timestamp(?: with(?:out)? time zone)?|time(?: with(?:out)? time zone)?|"[^"]+"|[a-z_][a-z0-9_]*)(?:\([^)]*\))?(?:\[\])?/gi

/**
 * Strips noise that differs between databases without being real drift: casts
 * (`'x'::text`), schema-qualified sequence names, redundant parentheses, whitespace.
 */
export function normaliseDefault(value: string | null): string | null {
  if (value === null) return null
  let v = value.trim()
  // nextval('public.flight_id_seq'::regclass) -> nextval(seq)
  v = v.replace(/nextval\([^)]*\)/gi, 'nextval(seq)')
  // strip ::type casts (including array and parameterised types)
  v = v.replace(CAST_RE, '')
  if (v === 'identity') v = 'nextval(seq)'
  v = v
    .replace(/\bnow\(\)/gi, 'now()')
    .replace(/\bCURRENT_TIMESTAMP\b/gi, 'now()')
  v = v.replace(/\s+/g, ' ')
  while (v.startsWith('(') && v.endsWith(')') && balanced(v.slice(1, -1))) {
    v = v.slice(1, -1).trim()
  }
  return v
}

function balanced(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth < 0) return false
  }
  return depth === 0
}

/** Normalises a pg_get_constraintdef() string so cosmetic differences compare equal. */
export function normaliseConstraint(def: string): string {
  let v = def.replace(CAST_RE, '')
  v = v.replace(/\bpublic\./g, '')
  // Collapse (ident) / ('literal') wrappers left behind by removed casts. The lookbehind
  // keeps real call/reference parens such as REFERENCES users(id) intact.
  let prev = ''
  while (prev !== v) {
    prev = v
    v = v.replace(/(?<![\w])\(([a-z_]\w*|'[^']*')\)/gi, '$1')
  }
  v = v.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  // ARRAY['a', 'b'] element order is irrelevant for CHECK ... = ANY (ARRAY[...]).
  v = v.replace(
    /ARRAY\[([^\]]*)\]/g,
    (_m, items: string) =>
      `ARRAY[${items
        .split(',')
        .map((i) => i.trim())
        .sort()
        .join(', ')}]`
  )
  v = v.replace(/\(\((ARRAY\[[^\]]*\])\)\)/g, '($1)')
  return v.trim()
}

const isBetween = (value: string, names: string[]) => names.includes(value)

/** Compares two snapshots, returning every difference restricted to `scope` tables. */
export function compareSchemas(
  live: SchemaSnapshot,
  local: SchemaSnapshot,
  scope: string[]
): Difference[] {
  const diffs: Difference[] = []
  const inScope = (t: string) => isBetween(t, scope)

  for (const table of [...scope].sort()) {
    const inLive = live.tables.includes(table)
    const inLocal = local.tables.includes(table)
    if (inLive && !inLocal) {
      diffs.push({
        key: `${table}:missing_local`,
        message: `table ${table} exists live but not locally`
      })
    } else if (!inLive && inLocal) {
      diffs.push({
        key: `${table}:missing_live`,
        message: `table ${table} exists locally but not live`
      })
    }
  }

  const colMap = (s: SchemaSnapshot) =>
    new Map(
      s.columns
        .filter((c) => inScope(c.table))
        .map((c) => [`${c.table}.${c.column}`, c])
    )
  const liveCols = colMap(live)
  const localCols = colMap(local)
  const colKeys = [...new Set([...liveCols.keys(), ...localCols.keys()])].sort()
  for (const k of colKeys) {
    const l = liveCols.get(k)
    const r = localCols.get(k)
    // Whole-table absence is already reported above.
    if (!l && r && !live.tables.includes(r.table)) continue
    if (l && !r && !local.tables.includes(l.table)) continue
    if (l && !r) {
      diffs.push({
        key: `${k}:missing_local`,
        message: `column ${k} exists live (${l.dataType}) but not locally`
      })
    } else if (!l && r) {
      diffs.push({
        key: `${k}:missing_live`,
        message: `column ${k} exists locally (${r.dataType}) but not live`
      })
    } else if (l && r) {
      if (l.dataType !== r.dataType) {
        diffs.push({
          key: `${k}:data_type:${l.dataType}/${r.dataType}`,
          message: `column ${k} data_type: live ${l.dataType} vs local ${r.dataType}`
        })
      }
      if (l.isNullable !== r.isNullable) {
        diffs.push({
          key: `${k}:is_nullable:${l.isNullable ? 'null' : 'notnull'}=>${r.isNullable ? 'null' : 'notnull'}`,
          message: `column ${k} nullable: live ${l.isNullable} vs local ${r.isNullable}`
        })
      }
      const ld = normaliseDefault(l.columnDefault)
      const rd = normaliseDefault(r.columnDefault)
      if (ld !== rd) {
        diffs.push({
          key: `${k}:column_default:${ld ?? 'none'}=>${rd ?? 'none'}`,
          message: `column ${k} default: live ${ld ?? 'none'} vs local ${rd ?? 'none'}`
        })
      }
    }
  }

  // Constraints are matched on table + kind + normalised definition, not on name,
  // because auto-generated names differ between Django-era and migration-built schemas.
  // For foreign keys the ON DELETE/DEFERRABLE tail is compared separately so a pure
  // action difference is reported as `...:actions:<live>=><local>`, not as a missing FK.
  const FK_RE = /^(FOREIGN KEY .*? REFERENCES \S+?\([^)]*\))\s*(.*)$/
  const split = (c: ConstraintInfo) => {
    const def = normaliseConstraint(c.definition)
    const m = c.kind === 'foreign_key' ? FK_RE.exec(def) : null
    return {
      id: `${c.table}:${c.kind}:${m ? m[1] : def}`,
      actions: m ? m[2] || 'NO ACTION' : '',
      table: c.table,
      kind: c.kind,
      text: m ? m[1] : def
    }
  }
  const conMap = (s: SchemaSnapshot) =>
    new Map(
      s.constraints
        .filter((c) => inScope(c.table))
        .map((c) => [split(c).id, split(c)])
    )
  const liveCon = conMap(live)
  const localCon = conMap(local)
  const ids = [...new Set([...liveCon.keys(), ...localCon.keys()])].sort()
  for (const id of ids) {
    const l = liveCon.get(id)
    const r = localCon.get(id)
    if (l && !r) {
      if (!local.tables.includes(l.table)) continue
      diffs.push({
        key: `${id}:missing_local`,
        message: `${l.kind} on ${l.table} exists live but not locally: ${l.text}`
      })
    } else if (!l && r) {
      if (!live.tables.includes(r.table)) continue
      diffs.push({
        key: `${id}:missing_live`,
        message: `${r.kind} on ${r.table} exists locally but not live: ${r.text}`
      })
    } else if (l && r && l.actions !== r.actions) {
      diffs.push({
        key: `${id}:actions:${l.actions}=>${r.actions}`,
        message: `${l.kind} on ${l.table} actions differ for ${l.text}: live ${l.actions} vs local ${r.actions}`
      })
    }
  }

  return diffs
}

/** Glob match where `*` matches any run of characters (including none). */
function globMatch(pattern: string, value: string): boolean {
  const re = pattern
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${re}$`).test(value)
}

/** Splits differences into allowed (with reason), unexplained, and stale allow-list keys. */
export function applyAllowList(
  diffs: Difference[],
  allow: AllowEntry[]
): {
  allowed: Array<Difference & { reason: string }>
  unexplained: Difference[]
  stale: AllowEntry[]
} {
  const used = new Set<string>()
  const allowed: Array<Difference & { reason: string }> = []
  const unexplained: Difference[] = []
  for (const d of diffs) {
    const hit = allow.find((a) => globMatch(a.key, d.key))
    if (hit) {
      allowed.push({ ...d, reason: hit.reason })
      used.add(hit.key)
    } else {
      unexplained.push(d)
    }
  }
  return { allowed, unexplained, stale: allow.filter((a) => !used.has(a.key)) }
}

/** Throws when an allow-list entry has no key or an empty reason. */
export function validateAllowList(raw: unknown): AllowEntry[] {
  if (!Array.isArray(raw)) throw new Error('allow-list must be a JSON array')
  return raw.map((e, i) => {
    if (
      !e ||
      typeof e.key !== 'string' ||
      !e.key ||
      typeof e.reason !== 'string' ||
      !e.reason.trim()
    ) {
      throw new Error(`allow-list entry ${i} needs a non-empty key and reason`)
    }
    return { key: e.key, reason: e.reason }
  })
}
