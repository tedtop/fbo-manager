import { describe, expect, it } from 'vitest'
import type { AirportLike } from '@/lib/airports'
import { airportCodeToLookUp, resolveAirportChoice, resolveAirportText } from '../resolve-airport'

const ap = (over: Partial<AirportLike> & Pick<AirportLike, 'ident' | 'name'>): AirportLike => ({
  icao: null,
  iata: null,
  faa: null,
  city: null,
  region: null,
  country: 'US',
  ...over
})

const AIRPORTS: AirportLike[] = [
  ap({ ident: 'KMSO', icao: 'KMSO', iata: 'MSO', faa: 'MSO', name: 'Missoula Montana Airport', city: 'Missoula', region: 'US-MT' }),
  ap({ ident: 'KSEA', icao: 'KSEA', iata: 'SEA', faa: 'SEA', name: 'Seattle Tacoma International Airport', city: 'Seattle', region: 'US-WA' }),
  ap({ ident: 'KGPI', icao: 'KGPI', iata: 'FCA', faa: 'GPI', name: 'Glacier Park International Airport', city: 'Kalispell', region: 'US-MT' }),
  ap({ ident: 'SKGP', icao: 'SKGP', iata: 'GPI', name: 'Juan Casiano Solis Airport', city: 'Guapi', country: 'CO' })
]

describe('resolveAirportText', () => {
  it('resolves an unambiguous IATA, FAA or ICAO code to the stored ICAO code', () => {
    expect(resolveAirportText('SEA', AIRPORTS)).toMatchObject({ state: 'resolved', code: 'KSEA' })
    expect(resolveAirportText(' mso ', AIRPORTS)).toMatchObject({ state: 'resolved', code: 'KMSO' })
    expect(resolveAirportText('KSEA', AIRPORTS)).toMatchObject({ state: 'resolved', code: 'KSEA' })
    expect(resolveAirportText('FCA', AIRPORTS)).toMatchObject({ state: 'resolved', code: 'KGPI' })
  })
  it('a code on several airports is ambiguous, home country first, never auto-picked', () => {
    const r = resolveAirportText('GPI', AIRPORTS, { homeCountry: 'US' })
    expect(r.state).toBe('ambiguous')
    if (r.state === 'ambiguous') expect(r.candidates.map((c) => c.icao)).toEqual(['KGPI', 'SKGP'])
  })
  it('place names and unknown codes are unmatched; blank stays blank', () => {
    expect(resolveAirportText('SEATTLE', AIRPORTS).state).toBe('unmatched')
    expect(resolveAirportText('ZZZ', AIRPORTS).state).toBe('unmatched')
    expect(resolveAirportText('  ', AIRPORTS)).toEqual({ state: 'blank' })
  })
})

describe('resolveAirportChoice', () => {
  it('user pick > auto-resolved > unresolved; blank is the empty code', () => {
    expect(resolveAirportChoice('SEA', null, AIRPORTS)).toMatchObject({ code: 'KSEA', fromUser: false })
    expect(resolveAirportChoice('SEA', 'KMSO', AIRPORTS)).toMatchObject({ code: 'KMSO', fromUser: true })
    expect(resolveAirportChoice('SEA', '', AIRPORTS)).toMatchObject({ code: '', fromUser: true })
    expect(resolveAirportChoice('GPI', null, AIRPORTS).code).toBeNull()
    expect(resolveAirportChoice('', null, AIRPORTS)).toMatchObject({ code: '', fromUser: false })
  })
})

describe('airportCodeToLookUp', () => {
  it('only code-shaped text is queried', () => {
    expect(airportCodeToLookUp(' sea ')).toBe('SEA')
    expect(airportCodeToLookUp('KBZN')).toBe('KBZN')
    expect(airportCodeToLookUp('SEATTLE')).toBeNull()
    expect(airportCodeToLookUp('')).toBeNull()
  })
})
