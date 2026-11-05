import type { AircraftLookupResult } from '@/lib/aircraft-lookup'
import {
  choiceFromLookup,
  countTypeUsage,
  effectiveAircraftType,
  tailForLookup
} from '@/lib/new-aircraft-type'
import { describe, expect, it } from 'vitest'

const HIT: AircraftLookupResult = {
  tail: 'N868CB',
  icao24: 'ABECC3',
  typeIcao: 'C25A',
  typeDescription: 'Citation CJ2',
  manufacturer: 'Cessna',
  source: 'adsbdb'
}

describe('tailForLookup', () => {
  const known = new Set(['N1KNOWN'])

  it('passes a valid new tail through', () => {
    expect(tailForLookup('N868CB', known)).toBe('N868CB')
  })

  it('stays idle for empty, invalid or known tails', () => {
    expect(tailForLookup('', known)).toBeNull()
    expect(tailForLookup('N', known)).toBeNull()
    expect(tailForLookup('N86 8CB', known)).toBeNull()
    expect(tailForLookup('N1KNOWN', known)).toBeNull()
  })
})

describe('choiceFromLookup', () => {
  it('uses the catalog name for a known ICAO code', () => {
    const choice = choiceFromLookup(HIT)
    expect(choice.icao).toBe('C25A')
    expect(choice.display).toMatch(/\S/)
  })

  it('falls back to manufacturer and description for an unknown code', () => {
    expect(choiceFromLookup({ ...HIT, typeIcao: 'ZZZZ' })).toEqual({
      icao: 'ZZZZ',
      display: 'Cessna Citation CJ2'
    })
  })

  it('omits a missing manufacturer', () => {
    expect(
      choiceFromLookup({ ...HIT, typeIcao: 'ZZZZ', manufacturer: null })
    ).toEqual({ icao: 'ZZZZ', display: 'Citation CJ2' })
  })
})

describe('effectiveAircraftType', () => {
  const manual = { icao: 'GLF6', display: 'Gulfstream G650' }

  it('never lets a lookup overwrite a manual pick', () => {
    expect(effectiveAircraftType(manual, 'N868CB', HIT)).toBe(manual)
  })

  it('applies the lookup when nothing was picked', () => {
    expect(effectiveAircraftType(null, 'N868CB', HIT)?.icao).toBe('C25A')
  })

  it('ignores a result for a tail that is no longer being looked up', () => {
    expect(effectiveAircraftType(null, 'N999ZZ', HIT)).toBeNull()
    expect(effectiveAircraftType(null, null, HIT)).toBeNull()
  })

  it('is empty without a result', () => {
    expect(effectiveAircraftType(null, 'N868CB', null)).toBeNull()
  })
})

describe('countTypeUsage', () => {
  it('counts per code and skips UNKN and empty', () => {
    expect(
      countTypeUsage([
        { aircraft_type_icao: 'c172' },
        { aircraft_type_icao: 'C172' },
        { aircraft_type_icao: 'UNKN' },
        { aircraft_type_icao: '' },
        { aircraft_type_icao: null }
      ])
    ).toEqual({ C172: 2 })
  })
})
