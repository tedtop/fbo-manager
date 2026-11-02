import {
  COMMON_ICAO_CODES,
  ICAO_AIRCRAFT_TYPES,
  type IcaoAircraftType,
  findIcaoType,
  formatIcaoType,
  rankAndFilterIcaoTypes
} from '@/lib/icao-aircraft-types'
import { describe, expect, it } from 'vitest'

describe('icao-aircraft-types', () => {
  it('includes GLF6 as Gulfstream G650', () => {
    const t = findIcaoType('glf6')
    expect(t?.model).toBe('G650')
    expect(t && formatIcaoType(t)).toBe('Gulfstream G650')
  })

  it.each(['glf6', 'g650', 'gulfstream', 'GULFSTREAM G650'])(
    'finds GLF6 by "%s"',
    (q) => {
      expect(rankAndFilterIcaoTypes(q, {}).map((t) => t.icao)).toContain('GLF6')
    }
  )

  it('returns nothing for a non-matching query', () => {
    expect(rankAndFilterIcaoTypes('zzzzqq', {})).toEqual([])
  })

  it('empty query returns the full list', () => {
    expect(rankAndFilterIcaoTypes('', {})).toHaveLength(
      ICAO_AIRCRAFT_TYPES.length
    )
  })

  it('orders usage, then common list, then alphabetical', () => {
    const ranked = rankAndFilterIcaoTypes('', { GLF2: 5, C150: 9 }).map(
      (t) => t.icao
    )
    expect(ranked.slice(0, 2)).toEqual(['C150', 'GLF2'])
    expect(ranked[2]).toBe(COMMON_ICAO_CODES[0])
    const commonEnd = 2 + COMMON_ICAO_CODES.length
    expect(ranked.slice(2, commonEnd)).toEqual(COMMON_ICAO_CODES)
    const rest = ranked
      .slice(commonEnd)
      .map((c) => formatIcaoType(findIcaoType(c) as IcaoAircraftType))
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)))
  })

  it('common codes all exist and are unique', () => {
    for (const c of COMMON_ICAO_CODES) expect(findIcaoType(c)).toBeDefined()
    expect(new Set(COMMON_ICAO_CODES).size).toBe(COMMON_ICAO_CODES.length)
  })

  it('has no duplicate ICAO codes', () => {
    const codes = ICAO_AIRCRAFT_TYPES.map((t) => t.icao)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('every entry is well-formed', () => {
    for (const t of ICAO_AIRCRAFT_TYPES) {
      expect(t.icao).toMatch(/^[A-Z0-9]{2,4}$/)
      expect(t.manufacturer.trim()).not.toBe('')
      expect(t.model.trim()).not.toBe('')
    }
  })
})
