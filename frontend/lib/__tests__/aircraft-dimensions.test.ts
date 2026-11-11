import { describe, expect, it } from 'vitest'
import {
  AIRCRAFT_DIMENSIONS,
  CATEGORY_NOMINAL_M,
  SILHOUETTE_CATEGORIES,
  dimensionsFor,
  inferCategory
} from '../aircraft-dimensions'
import { silhouetteParts } from '../aircraft-silhouettes'
import { ICAO_AIRCRAFT_TYPES } from '../icao-aircraft-types'

describe('dimensionsFor', () => {
  it('returns the real size of a known type', () => {
    expect(dimensionsFor('C172')).toEqual({
      wingspanM: 11.0,
      lengthM: 8.3,
      category: 'single-high',
      estimated: false
    })
    expect(dimensionsFor('b738')).toMatchObject({
      wingspanM: 35.8,
      category: 'airliner',
      estimated: false
    })
    expect(dimensionsFor(' GLF6 ').category).toBe('mid-jet')
  })

  it('falls back to a nominal category size, flagged estimated', () => {
    for (const blank of ['', '  ', 'UNKN', 'ZZZZ', undefined, null]) {
      const d = dimensionsFor(blank)
      expect(d.estimated).toBe(true)
      expect(d.category).toBe('single-low')
      expect(d.wingspanM).toBe(CATEGORY_NOMINAL_M['single-low'].wingspanM)
    }
  })

  it('uses the caller fallback category for unknown types', () => {
    expect(dimensionsFor('UNKN', 'airliner')).toMatchObject({
      category: 'airliner',
      estimated: true,
      wingspanM: CATEGORY_NOMINAL_M.airliner.wingspanM
    })
  })

  it('does not let the fallback override a known type', () => {
    expect(dimensionsFor('PC12', 'airliner').category).toBe('single-low')
  })

  it('maps ids stored by the older size picker', () => {
    expect(dimensionsFor('narrow_body').category).toBe('airliner')
    expect(dimensionsFor('light_twin').category).toBe('twin-piston')
  })
})

describe('inferCategory', () => {
  it('uses the ICAO class code and wake category', () => {
    expect(inferCategory('R44')).toBe('helicopter')
    expect(inferCategory('BE20')).toBe('turboprop')
    expect(inferCategory('PA34')).toBe('twin-piston')
    expect(inferCategory('C172')).toBe('single-low')
    expect(inferCategory('C510')).toBe('light-jet')
    expect(inferCategory('GLF6')).toBe('mid-jet')
    expect(inferCategory('B744')).toBe('airliner')
    expect(inferCategory('A332')).toBe('airliner')
  })

  it('knows nothing about codes outside the ICAO table', () => {
    expect(inferCategory('ZZZZ')).toBeNull()
    expect(inferCategory('')).toBeNull()
  })
})

describe('dimension table', () => {
  it('has plausible dimensions and a silhouette for every entry', () => {
    for (const [icao, d] of Object.entries(AIRCRAFT_DIMENSIONS)) {
      expect(d.wingspanM, icao).toBeGreaterThanOrEqual(5)
      expect(d.wingspanM, icao).toBeLessThanOrEqual(80)
      expect(d.lengthM, icao).toBeGreaterThanOrEqual(5)
      expect(d.lengthM, icao).toBeLessThanOrEqual(80)
      expect(SILHOUETTE_CATEGORIES, icao).toContain(d.category)
      expect(
        silhouetteParts(d.category, d.wingspanM / d.lengthM).length,
        icao
      ).toBeGreaterThan(0)
    }
  })

  it('covers every type in the ICAO table and the codes seen at KMSO', () => {
    const missing = ICAO_AIRCRAFT_TYPES.map((t) => t.icao).filter(
      (icao) => !AIRCRAFT_DIMENSIONS[icao]
    )
    expect(missing).toEqual([])
    for (const icao of [
      'C82R',
      'C82S',
      'C82T',
      'T206',
      'PA12',
      'PA18',
      'S108',
      'HUSK',
      'CH7B',
      'H500',
      'DA40',
      'DA42',
      'BE36',
      'BE35',
      'M20P',
      'AA5'
    ]) {
      expect(AIRCRAFT_DIMENSIONS[icao], icao).toBeDefined()
    }
  })

  it('agrees with the ICAO class: helicopters are rotorcraft and only they are', () => {
    for (const t of ICAO_AIRCRAFT_TYPES) {
      const isHeli = AIRCRAFT_DIMENSIONS[t.icao]?.category === 'helicopter'
      expect(isHeli, t.icao).toBe(t.classCode?.[0] === 'H')
    }
  })

  it('keeps relative scale across the fleet', () => {
    const span = (c: string) => dimensionsFor(c).wingspanM
    const len = (c: string) => dimensionsFor(c).lengthM
    for (const f of [span, len]) {
      expect(f('C172')).toBeLessThan(f('PC12'))
      expect(f('PC12')).toBeLessThan(f('GLF6'))
      expect(f('GLF6')).toBeLessThan(f('B738'))
    }
    expect(span('BE20')).toBeGreaterThan(span('C172'))
    expect(span('A388')).toBeGreaterThan(span('B748'))
    expect(span('R44')).toBeLessThan(len('R44'))
  })
})
