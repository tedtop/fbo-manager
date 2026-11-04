import { describe, expect, it } from 'vitest'
import {
  applyAllowList,
  type ColumnInfo,
  type ConstraintInfo,
  compareSchemas,
  normaliseConstraint,
  normaliseDefault,
  type SchemaSnapshot,
  validateAllowList
} from '../schema-parity-core'

const col = (over: Partial<ColumnInfo> = {}): ColumnInfo => ({
  table: 'flight',
  column: 'notes',
  dataType: 'text',
  isNullable: false,
  columnDefault: null,
  ...over
})
const snap = (
  columns: ColumnInfo[],
  constraints: ConstraintInfo[] = [],
  tables = ['flight']
): SchemaSnapshot => ({ tables, columns, constraints })

describe('normaliseDefault', () => {
  it('strips casts, sequence names and whitespace', () => {
    expect(normaliseDefault("'line'::character varying")).toBe("'line'")
    expect(normaliseDefault("nextval('public.flight_id_seq'::regclass)")).toBe(
      'nextval(seq)'
    )
    expect(normaliseDefault("'{}'::text[]")).toBe("'{}'")
    expect(normaliseDefault('(1)')).toBe('1')
  })
  it('treats identity as an auto-generated sequence', () => {
    expect(normaliseDefault('identity')).toBe('nextval(seq)')
  })
  it('keeps null distinct from empty string', () => {
    expect(normaliseDefault(null)).toBeNull()
    expect(normaliseDefault("''::text")).toBe("''")
  })
  it('treats CURRENT_TIMESTAMP as now()', () => {
    expect(normaliseDefault('CURRENT_TIMESTAMP')).toBe('now()')
  })
})

describe('normaliseConstraint', () => {
  it('ignores casts, redundant parens and array element order', () => {
    const live =
      "CHECK (((flight_status)::text = ANY ((ARRAY['b'::character varying, 'a'::character varying])::text[])))"
    const local = "CHECK ((flight_status = ANY (ARRAY['a', 'b'])))"
    expect(normaliseConstraint(live)).toBe(normaliseConstraint(local))
  })
  it('keeps REFERENCES table(col) intact', () => {
    expect(
      normaliseConstraint('FOREIGN KEY (created_by_id) REFERENCES users(id)')
    ).toContain('REFERENCES users(id)')
  })
})

describe('compareSchemas', () => {
  it('reports no drift for identical schemas', () => {
    const s = snap([col()])
    expect(compareSchemas(s, s, ['flight'])).toEqual([])
  })

  it('flags a default present on one side only, with direction in the key', () => {
    const live = snap([col({ column: 'created_by_id', columnDefault: '1' })])
    const local = snap([col({ column: 'created_by_id' })])
    const [d] = compareSchemas(live, local, ['flight'])
    expect(d.key).toBe('flight.created_by_id:column_default:1=>none')
  })

  it('ignores cosmetic default differences', () => {
    const live = snap([col({ columnDefault: "''::text" })])
    const local = snap([col({ columnDefault: "''" })])
    expect(compareSchemas(live, local, ['flight'])).toEqual([])
  })

  it('flags nullability and type drift', () => {
    const live = snap([col({ isNullable: true, dataType: 'jsonb' })])
    const local = snap([col({ dataType: 'ARRAY' })])
    expect(compareSchemas(live, local, ['flight']).map((d) => d.key)).toEqual([
      'flight.notes:data_type:jsonb/ARRAY',
      'flight.notes:is_nullable:null=>notnull'
    ])
  })

  it('reports a missing table once, not once per column', () => {
    const live = snap([col()], [], ['flight'])
    const local = snap([], [], [])
    expect(compareSchemas(live, local, ['flight']).map((d) => d.key)).toEqual([
      'flight:missing_local'
    ])
  })

  it('reports missing columns on either side', () => {
    const live = snap([col(), col({ column: 'a' })])
    const local = snap([col(), col({ column: 'b' })])
    expect(compareSchemas(live, local, ['flight']).map((d) => d.key)).toEqual([
      'flight.a:missing_local',
      'flight.b:missing_live'
    ])
  })

  it('ignores tables outside the scope', () => {
    const live = snap([col({ table: 'qt_session' })], [], ['qt_session'])
    const local = snap([], [], [])
    expect(compareSchemas(live, local, ['flight'])).toEqual([])
  })

  it('matches constraints by definition, not name, and reports FK action drift', () => {
    const fk = (name: string, def: string): ConstraintInfo => ({
      table: 'flight',
      name,
      kind: 'foreign_key',
      definition: def
    })
    const live = snap(
      [],
      [
        fk(
          'django_1',
          'FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL'
        )
      ]
    )
    const local = snap(
      [],
      [fk('flight_fk', 'FOREIGN KEY (created_by_id) REFERENCES users(id)')]
    )
    const [d] = compareSchemas(live, local, ['flight'])
    expect(d.key).toBe(
      'flight:foreign_key:FOREIGN KEY created_by_id REFERENCES users(id):actions:ON DELETE SET NULL=>NO ACTION'
    )
  })

  it('reports a CHECK present only locally', () => {
    const local = snap(
      [],
      [
        {
          table: 'flight',
          name: 'c',
          kind: 'check',
          definition: "CHECK ((status = ANY (ARRAY['a'])))"
        }
      ]
    )
    const [d] = compareSchemas(snap([]), local, ['flight'])
    expect(d.key).toMatch(/^flight:check:.*:missing_live$/)
  })
})

describe('applyAllowList', () => {
  const diffs = [
    { key: 'flight.services:data_type:jsonb/ARRAY', message: 'm1' },
    { key: "flight.notes:column_default:none=>''", message: 'm2' },
    { key: 'flight.x:missing_live', message: 'm3' }
  ]
  it('supports * globs, keeps reasons and leaves the rest unexplained', () => {
    const r = applyAllowList(diffs, [
      { key: 'flight.services:*', reason: 'jsonb vs text[]' },
      { key: '*:column_default:none=>*', reason: 'django' }
    ])
    expect(r.allowed.map((a) => a.reason)).toEqual([
      'jsonb vs text[]',
      'django'
    ])
    expect(r.unexplained.map((d) => d.key)).toEqual(['flight.x:missing_live'])
    expect(r.stale).toEqual([])
  })
  it('reports allow entries that no longer match as stale', () => {
    const r = applyAllowList([], [{ key: 'gone:missing_live', reason: 'old' }])
    expect(r.stale).toHaveLength(1)
  })
})

describe('validateAllowList', () => {
  it('requires a non-empty reason', () => {
    expect(() => validateAllowList([{ key: 'a', reason: ' ' }])).toThrow(
      /reason/
    )
    expect(() => validateAllowList({})).toThrow(/array/)
    expect(validateAllowList([{ key: 'a', reason: 'why' }])).toHaveLength(1)
  })
})
