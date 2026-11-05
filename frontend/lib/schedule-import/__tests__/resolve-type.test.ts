import { describe, expect, it } from 'vitest'
import { findIcaoType } from '@/lib/icao-aircraft-types'
import { resolveAircraftType } from '../review'
import { matchPrintedType } from '../resolve-type'

// Expected codes are read from the table itself, never hardcoded guesses.
const code = (printed: string) => matchPrintedType(printed)?.icao ?? null

describe('matchPrintedType', () => {
  it('takes an ICAO designator as printed, with spaces or dashes', () => {
    expect(code('C525')).toBe('C525')
    expect(code('glf4')).toBe('GLF4')
    expect(code('PC-12')).toBe('PC12')
    expect(code('KING AIR 350')).toBe('B350')
  })

  it('takes freehand text that names exactly one table row', () => {
    expect(code('CJ2')).toBe('C25A')
    expect(findIcaoType('C25A')?.model).toMatch(/CJ2/)
    expect(code('CITATION CJ3')).toBe('C25B')
    expect(code('ENCORE')).toBe('C560')
  })

  it('leaves ambiguous or unknown text unresolved', () => {
    expect(code('BRAVO')).toBeNull() // Cessna Citation II / Bravo and Mooney Bravo
    expect(code('KING AIR')).toBeNull()
    expect(code('350')).toBeNull()
    expect(code('G-IVSP')).toBeNull() // a registration-like word, no table row
    expect(code('')).toBeNull()
  })
})

describe('resolveAircraftType priority', () => {
  const found = { state: 'found', icao: 'GLF4', display: 'Gulfstream G-IV / G400' } as const

  it('user choice beats the registry and the printed text', () => {
    expect(resolveAircraftType('C525', found, 'CJ2')).toMatchObject({ icao: 'C525', source: 'override' })
  })
  it('registry ICAO beats the printed text', () => {
    expect(resolveAircraftType(null, found, 'CJ2')).toMatchObject({ icao: 'GLF4', source: 'registry' })
  })
  it('an unambiguous printed text fills in when the lookup found nothing or there was no lookup', () => {
    expect(resolveAircraftType(null, { state: 'none' }, 'CJ2')).toMatchObject({ icao: 'C25A', source: 'printed' })
    expect(resolveAircraftType(null, undefined, 'CJ2')).toMatchObject({ icao: 'C25A', source: 'printed' })
  })
  it('a running lookup is waited for, not answered by the printed text', () => {
    expect(resolveAircraftType(null, { state: 'pending' }, 'CJ2')).toEqual({ icao: null, display: '', source: 'none' })
  })
  it('otherwise unresolved', () => {
    expect(resolveAircraftType(null, { state: 'none' }, 'BRAVO')).toEqual({ icao: null, display: '', source: 'none' })
    expect(resolveAircraftType(null, { state: 'none' })).toEqual({ icao: null, display: '', source: 'none' })
  })
})
