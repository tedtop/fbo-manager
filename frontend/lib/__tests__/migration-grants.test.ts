import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findAnonGrants, isPostCutoff } from '@/lib/migration-lint'

describe('findAnonGrants', () => {
  it('catches the copy-pasted sequence grant', () => {
    expect(
      findAnonGrants('grant all on all sequences in schema public to anon, authenticated, service_role;')
    ).toHaveLength(1)
  })
  it('catches table grants in any case', () => {
    expect(findAnonGrants('GRANT SELECT ON foo TO anon;')).toHaveLength(1)
  })
  it('catches multi-line grants', () => {
    expect(
      findAnonGrants('grant all\n  on all sequences in schema public\n  to authenticated,\n     anon;')
    ).toHaveLength(1)
  })
  it('catches function and schema grants', () => {
    expect(
      findAnonGrants('grant execute on function f() to anon;\ngrant usage on schema public to anon;')
    ).toHaveLength(2)
  })
  it('ignores revokes', () => {
    expect(findAnonGrants('revoke all on all sequences in schema public from anon;')).toEqual([])
  })
  it('ignores comments mentioning anon', () => {
    expect(findAnonGrants('-- grant all on foo to anon;\n/* grant all on foo to anon; */\nselect 1;')).toEqual([])
  })
  it('ignores authenticated and service_role only', () => {
    expect(
      findAnonGrants('grant all on all sequences in schema public to authenticated, service_role;')
    ).toEqual([])
  })
  it('does not match roles merely containing "anon"', () => {
    expect(findAnonGrants('grant select on foo to anonymous_reader;')).toEqual([])
  })
})

describe('migrations after the cutoff', () => {
  const dir = join(__dirname, '../../supabase/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && isPostCutoff(f))
  it('includes the B94 migration', () => {
    expect(files).toContain('20261113000400_revoke_anon_regrants.sql')
  })
  it.each(files)('%s grants nothing to anon', (f) => {
    expect(findAnonGrants(readFileSync(join(dir, f), 'utf8'))).toEqual([])
  })
})
