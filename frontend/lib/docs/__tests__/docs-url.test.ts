import { describe, expect, it } from 'vitest'
import { buildDocsUrl, parseDocsState } from '../docs-url'

const known = (id: string) => id === 'flight-operations'

describe('buildDocsUrl', () => {
  it('opens docs with module and anchor', () => {
    expect(buildDocsUrl('/', '', 'flight-operations', 'quick-turn')).toBe('/?docs=flight-operations#quick-turn')
  })
  it('opens without an anchor', () => {
    expect(buildDocsUrl('/parking', '', 'flight-operations')).toBe('/parking?docs=flight-operations')
  })
  it('preserves existing query params', () => {
    expect(buildDocsUrl('/', 'q=N1&status=active', 'flight-operations', 'times')).toBe(
      '/?q=N1&status=active&docs=flight-operations#times'
    )
  })
  it('replaces an existing docs param', () => {
    expect(buildDocsUrl('/', 'docs=other&q=1', 'flight-operations', 'add-flight')).toBe(
      '/?docs=flight-operations&q=1#add-flight'
    )
  })
  it('closing removes docs and hash but keeps the rest', () => {
    expect(buildDocsUrl('/', 'q=N1&docs=flight-operations', null)).toBe('/?q=N1')
    expect(buildDocsUrl('/', 'docs=flight-operations', null, 'times')).toBe('/')
  })
  it('accepts URLSearchParams', () => {
    expect(buildDocsUrl('/', new URLSearchParams('a=1'), 'flight-operations')).toBe('/?a=1&docs=flight-operations')
  })
})

describe('parseDocsState', () => {
  it('reads module and anchor', () => {
    expect(parseDocsState('docs=flight-operations', '#time-zone', known)).toEqual({
      moduleId: 'flight-operations',
      anchor: 'time-zone'
    })
  })
  it('anchor is optional', () => {
    expect(parseDocsState('docs=flight-operations', '', known)).toEqual({ moduleId: 'flight-operations', anchor: null })
  })
  it('ignores unknown or missing modules', () => {
    expect(parseDocsState('docs=nope', '#x', known)).toBeNull()
    expect(parseDocsState('q=1', '', known)).toBeNull()
  })
  it('survives a bad percent escape', () => {
    expect(parseDocsState('docs=flight-operations', '#%E0%A4%A', known)?.anchor).toBeNull()
  })
})
