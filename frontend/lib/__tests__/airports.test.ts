import { describe, expect, it } from 'vitest'
import {
  type AirportLike,
  displayCode,
  formatAirportOption,
  isAmbiguous,
  normalizeAirportQuery,
  rankAirports,
  storedCode
} from '@/lib/airports'

const ap = (
  p: Partial<AirportLike> & Pick<AirportLike, 'ident' | 'name' | 'country'>
): AirportLike => ({
  icao: null,
  iata: null,
  faa: null,
  city: null,
  region: null,
  type: 'medium_airport',
  scheduled_service: true,
  ...p
})

const KMSO = ap({
  ident: 'KMSO',
  icao: 'KMSO',
  iata: 'MSO',
  faa: 'MSO',
  name: 'Missoula Montana Airport',
  city: 'Missoula',
  region: 'US-MT',
  country: 'US'
})
const KGPI = ap({
  ident: 'KGPI',
  icao: 'KGPI',
  iata: 'FCA',
  faa: 'GPI',
  name: 'Glacier Park International Airport',
  city: 'Kalispell',
  region: 'US-MT',
  country: 'US'
})
const SKGP = ap({
  ident: 'SKGP',
  icao: 'SKGP',
  iata: 'GPI',
  name: 'Guapi Airport',
  city: 'Guapi',
  region: 'CO-CAU',
  country: 'CO'
})
const PANC = ap({
  ident: 'PANC',
  icao: 'PANC',
  iata: 'ANC',
  faa: 'ANC',
  name: 'Ted Stevens Anchorage International Airport',
  city: 'Anchorage',
  region: 'US-AK',
  country: 'US',
  type: 'large_airport'
})
const PHNL = ap({
  ident: 'PHNL',
  icao: 'PHNL',
  iata: 'HNL',
  faa: 'HNL',
  name: 'Daniel K. Inouye International Airport',
  city: 'Honolulu, Oahu',
  region: 'US-HI',
  country: 'US',
  type: 'large_airport'
})
const TJSJ = ap({
  ident: 'TJSJ',
  icao: 'TJSJ',
  iata: 'SJU',
  name: 'Luis Munoz Marin International Airport',
  city: 'San Juan',
  region: 'PR-U-A',
  country: 'PR',
  type: 'large_airport'
})
const STRIP = ap({
  ident: '3U7',
  faa: '3U7',
  name: 'Benchmark Airport',
  city: 'Augusta',
  region: 'US-MT',
  country: 'US',
  type: 'small_airport',
  scheduled_service: false
})
const ALL = [KMSO, KGPI, SKGP, PANC, PHNL, TJSJ, STRIP]

const codes = (list: AirportLike[]) => list.map(storedCode)

describe('normalizeAirportQuery', () => {
  it('trims, upper-cases and collapses spaces', () => {
    expect(normalizeAirportQuery('  mso ')).toBe('MSO')
    expect(normalizeAirportQuery('glacier   park')).toBe('GLACIER PARK')
  })
})

describe('rankAirports', () => {
  const us = { homeCountry: 'US' }

  it('resolves IATA, FAA and ICAO codes to the same airport', () => {
    expect(codes(rankAirports(ALL, 'MSO', us))).toEqual(['KMSO'])
    expect(codes(rankAirports(ALL, 'kmso', us))).toEqual(['KMSO'])
    expect(codes(rankAirports(ALL, 'ANC', us))).toEqual(['PANC'])
    expect(codes(rankAirports(ALL, 'HNL', us))).toEqual(['PHNL'])
    expect(codes(rankAirports(ALL, 'SJU', us))).toEqual(['TJSJ'])
  })

  it('finds Glacier Park by IATA (FCA), FAA (GPI) and ICAO (KGPI)', () => {
    expect(codes(rankAirports(ALL, 'FCA', us))).toEqual(['KGPI'])
    expect(rankAirports(ALL, 'GPI', us)[0]).toBe(KGPI)
    expect(rankAirports(ALL, 'KGPI', us)).toEqual([KGPI])
  })

  it('returns both GPI airports, home country first', () => {
    expect(codes(rankAirports(ALL, 'GPI', us))).toEqual(['KGPI', 'SKGP'])
    expect(codes(rankAirports(ALL, 'GPI', { homeCountry: 'CO' }))).toEqual([
      'SKGP',
      'KGPI'
    ])
  })

  it('flags ambiguous codes but not unique ones', () => {
    expect(isAmbiguous(rankAirports(ALL, 'GPI', us), 'GPI')).toBe(true)
    expect(isAmbiguous(rankAirports(ALL, 'MSO', us), 'MSO')).toBe(false)
    expect(isAmbiguous(rankAirports(ALL, 'KGPI', us), 'KGPI')).toBe(false)
  })

  it('ranks exact code above prefix above name match', () => {
    const list = [
      ap({
        ident: 'KMSOX',
        name: 'Msox Field',
        country: 'US',
        icao: null,
        faa: 'MSOX'
      }),
      KMSO,
      ap({ ident: 'X1', name: 'Near MSO Heliport', country: 'US' })
    ]
    expect(rankAirports(list, 'MSO', us).map((a) => a.ident)).toEqual([
      'KMSO',
      'KMSOX',
      'X1'
    ])
  })

  it('searches name and city', () => {
    expect(codes(rankAirports(ALL, 'Kalispell', us))).toEqual(['KGPI'])
    expect(codes(rankAirports(ALL, 'glacier', us))).toEqual(['KGPI'])
    expect(codes(rankAirports(ALL, 'anchorage', us))).toEqual(['PANC'])
  })

  it('matches nothing for an unknown string (so it stays as typed)', () => {
    expect(rankAirports(ALL, 'ZZZZ', us)).toEqual([])
    expect(rankAirports(ALL, '   ', us)).toEqual([])
  })
})

describe('storedCode', () => {
  it('prefers ICAO, then FAA, IATA, ident', () => {
    expect(storedCode(KMSO)).toBe('KMSO')
    expect(storedCode(STRIP)).toBe('3U7')
    expect(storedCode({ ident: 'X', icao: null, faa: null, iata: 'ABC' })).toBe(
      'ABC'
    )
    expect(storedCode({ ident: 'X', icao: null, faa: null, iata: null })).toBe(
      'X'
    )
  })
})

describe('displayCode', () => {
  it('shows the FAA identifier by default for US airports, else IATA, else ICAO', () => {
    expect(displayCode(KGPI, 'faa')).toBe('GPI')
    expect(displayCode(SKGP, 'faa')).toBe('GPI')
    expect(displayCode(TJSJ, 'faa')).toBe('SJU')
    expect(
      displayCode({ ident: 'X', icao: 'XXXX', iata: null, faa: null }, 'faa')
    ).toBe('XXXX')
  })

  it('honours the IATA and ICAO preferences with fallback', () => {
    expect(displayCode(KGPI, 'iata')).toBe('FCA')
    expect(displayCode(KGPI, 'icao')).toBe('KGPI')
    expect(displayCode(STRIP, 'icao')).toBe('3U7')
    expect(displayCode(STRIP, 'iata')).toBe('3U7')
  })
})

describe('formatAirportOption', () => {
  it('lists the codes, short name and place', () => {
    expect(formatAirportOption(KGPI)).toBe(
      'KGPI · FCA · GPI  Glacier Park Intl, Kalispell MT'
    )
    expect(formatAirportOption(KMSO)).toBe(
      'KMSO · MSO  Missoula Montana, Missoula MT'
    )
    expect(formatAirportOption(SKGP)).toBe('SKGP · GPI  Guapi, Guapi CO')
  })
})
