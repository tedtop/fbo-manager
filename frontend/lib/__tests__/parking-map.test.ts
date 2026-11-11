import {
  AREA_FILL_COLORS,
  AREA_FILL_OPACITY,
  AREA_KINDS,
  ICON_SCALE,
  KIND_META,
  areaFeatureCollection,
  countAircraftByArea,
  feetPerPixel,
  headingForScreenDirection,
  iconPixelSize,
  moveAlongHeading,
  normalizeHeading,
  normalizeTailNumber,
  resolveIconDefinition,
  stepPose,
  tailNumberError,
  toParkedPlane,
  toStoredHeading
} from '@/lib/parking-map'
import type { AircraftRow } from '@/repositories/aircraft.repo'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import { describe, expect, it } from 'vitest'

function area(
  id: number,
  code: string,
  polygon: unknown,
  kind: ParkingAreaRow['kind'] = 'ramp'
): ParkingAreaRow {
  return {
    id,
    code,
    name: code,
    kind,
    polygon,
    airport: 'MSO',
    display_order: 0,
    is_active: true,
    created_at: '',
    updated_at: ''
  }
}

const square = (x: number, y: number, size: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y]
    ]
  ]
})

describe('headings', () => {
  it('folds any angle into [0, 360)', () => {
    expect(normalizeHeading(-10)).toBe(350)
    expect(normalizeHeading(370)).toBe(10)
    expect(normalizeHeading(360)).toBe(0)
  })

  it('stores a whole degree in 0..359', () => {
    expect(toStoredHeading(359.6)).toBe(0)
    expect(toStoredHeading(-0.4)).toBe(0)
    expect(toStoredHeading(123.4)).toBe(123)
  })

  it('points the nose at a screen direction for the current bearing', () => {
    expect(headingForScreenDirection(270, 40)).toBe(310)
    expect(headingForScreenDirection(0, 0)).toBe(0)
    expect(headingForScreenDirection(270, 180)).toBe(90)
  })
})

describe('icon sizing', () => {
  it('halves the resolution at each zoom level', () => {
    const z17 = feetPerPixel(46.9, 17)
    expect(feetPerPixel(46.9, 18)).toBeCloseTo(z17 / 2, 6)
  })

  it('matches the MapLibre ground resolution at the equator, zoom 0', () => {
    expect(feetPerPixel(0, 0)).toBeCloseTo(78_271.517 * 3.28084, 3)
  })

  it('sizes the icon by wingspan x length in feet', () => {
    const def = resolveIconDefinition('light_single')
    const { width, height } = iconPixelSize('light_single', 46.9, 18)
    const expectedScale = ICON_SCALE / feetPerPixel(46.9, 18)
    expect(width).toBeCloseTo(def.wingspan * expectedScale, 6)
    expect(height).toBeCloseTo(def.length * expectedScale, 6)
  })

  it('accepts type ids and ICAO codes, falling back to a default', () => {
    expect(resolveIconDefinition('regional_jet').id).toBe('regional_jet')
    expect(resolveIconDefinition('C172').id).toBe('light_single')
    expect(resolveIconDefinition('B738').id).toBe('narrow_body')
    expect(resolveIconDefinition('').id).toBe('light_single')
  })
})

describe('movement', () => {
  const start = { lat: 46.92, lng: -114.08, heading: 0 }

  it('moves north along heading 0 and east along heading 90', () => {
    const north = moveAlongHeading(start, 0, 100)
    expect(north.lat).toBeGreaterThan(start.lat)
    expect(north.lng).toBeCloseTo(start.lng, 9)
    const east = moveAlongHeading(start, 90, 100)
    expect(east.lng).toBeGreaterThan(start.lng)
    expect(east.lat).toBeCloseTo(start.lat, 9)
  })

  it('moves about 100 feet for 100 feet of travel', () => {
    const moved = moveAlongHeading(start, 0, 100)
    const feet = (moved.lat - start.lat) * 111_320 * 3.28084
    expect(feet).toBeCloseTo(100, 3)
  })

  it('moves backwards with a negative distance', () => {
    expect(moveAlongHeading(start, 0, -100).lat).toBeLessThan(start.lat)
  })

  it('turns with left/right and wraps around', () => {
    const none = { left: false, right: false, up: false, down: false }
    const left = stepPose(start, { ...none, left: true }, 0.05)
    expect(left.heading).toBeCloseTo(354, 6)
    const right = stepPose(
      { ...start, heading: 359 },
      { ...none, right: true },
      0.05
    )
    expect(right.heading).toBeCloseTo(5, 6)
  })

  it('moves forward along the nose and back against it', () => {
    const none = { left: false, right: false, up: false, down: false }
    const forward = stepPose(
      { ...start, heading: 90 },
      { ...none, up: true },
      0.05
    )
    expect(forward.lng).toBeGreaterThan(start.lng)
    const back = stepPose(
      { ...start, heading: 90 },
      { ...none, down: true },
      0.05
    )
    expect(back.lng).toBeLessThan(start.lng)
  })

  it('caps a long frame so a stalled tab cannot teleport the plane', () => {
    const none = { left: false, right: false, up: true, down: false }
    const long = stepPose(start, none, 5)
    const capped = stepPose(start, none, 0.1)
    expect(long.lat).toBeCloseTo(capped.lat, 12)
  })
})

describe('aircraft rows', () => {
  const row = (overrides: Partial<AircraftRow>): AircraftRow => ({
    tail_number: 'N1',
    aircraft_type_icao: 'C172',
    aircraft_type_display: 'Cessna 172',
    airline_icao: '',
    fleet_id: '',
    created_at: '',
    updated_at: '',
    parked_lat: null,
    parked_lng: null,
    parked_heading: null,
    parked_area_id: null,
    parked_at: null,
    ...overrides
  })

  it('ignores aircraft that are not parked', () => {
    expect(toParkedPlane(row({}))).toBeNull()
  })

  it('converts numeric strings and numbers to numbers', () => {
    const plane = toParkedPlane(
      row({
        parked_lat: '46.921800',
        parked_lng: -114.0859 as unknown as string,
        parked_heading: 270
      })
    )
    expect(plane).toMatchObject({
      tailNumber: 'N1',
      lat: 46.9218,
      lng: -114.0859,
      heading: 270
    })
  })

  it('defaults a missing heading to 0 and rejects non-numeric positions', () => {
    expect(
      toParkedPlane(row({ parked_lat: '46.9', parked_lng: '-114.0' }))?.heading
    ).toBe(0)
    expect(
      toParkedPlane(row({ parked_lat: 'abc', parked_lng: '-114.0' }))
    ).toBeNull()
  })
})

describe('area membership', () => {
  const outer = area(1, 'RAMP', square(0, 0, 10))
  const inner = area(2, 'TD', square(2, 2, 2), 'tie_down')
  const far = area(3, 'FAR', square(50, 50, 5))
  const plane = (lng: number, lat: number) => ({ lat, lng, heading: 0 })

  it('counts planes per area and prefers the smallest containing area', () => {
    const counts = countAircraftByArea(
      [outer, inner, far],
      [plane(3, 3), plane(1, 1), plane(8, 8), plane(100, 100)]
    )
    expect(counts.get(2)).toBe(1)
    expect(counts.get(1)).toBe(2)
    expect(counts.get(3)).toBeUndefined()
  })

  it('counts nothing when no area has a polygon', () => {
    expect(countAircraftByArea([area(9, 'X', null)], [plane(1, 1)]).size).toBe(
      0
    )
  })
})

describe('tail numbers', () => {
  it('strips spaces and upper-cases', () => {
    expect(normalizeTailNumber(' n 172sp ')).toBe('N172SP')
  })

  it('accepts normal tails and rejects empty or odd ones', () => {
    expect(tailNumberError('N172SP')).toBeNull()
    expect(tailNumberError('C-GABC')).toBeNull()
    expect(tailNumberError('')).not.toBeNull()
    expect(tailNumberError('N')).not.toBeNull()
    expect(tailNumberError('N17 2')).not.toBeNull()
    expect(tailNumberError('N172SP12345')).not.toBeNull()
  })
})

describe('areaFeatureCollection', () => {
  it('renders GeoJSON and legacy bare-ring polygons, skipping empty and hidden areas', () => {
    const geo = area(1, 'A', square(0, 0, 1))
    const legacy = area(2, 'B', square(0, 0, 1).coordinates[0])
    const empty = area(3, 'C', null)
    const hidden = area(4, 'D', square(2, 2, 1))
    const fc = areaFeatureCollection([geo, legacy, empty, hidden], 2, 4)
    expect(fc.features.map((f) => f.properties.code)).toEqual(['A', 'B'])
    expect(fc.features[0].geometry.coordinates[0]).toHaveLength(5)
    expect(fc.features.map((f) => f.properties.selected)).toEqual([false, true])
  })

  it('colours by kind', () => {
    const fc = areaFeatureCollection(
      [area(1, 'H', square(0, 0, 1), 'hangar')],
      null
    )
    expect(fc.features[0].properties.kind).toBe('hangar')
    expect(fc.features[0].properties.color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('carries a solid fill colour per kind, distinct from the others and the edit blue', () => {
    const fills = AREA_KINDS.map((kind) => {
      const fc = areaFeatureCollection(
        [area(1, 'X', square(0, 0, 1), kind)],
        null
      )
      expect(fc.features[0].properties.fillColor).toBe(AREA_FILL_COLORS[kind])
      return AREA_FILL_COLORS[kind]
    })
    expect(new Set(fills).size).toBe(AREA_KINDS.length)
    expect(fills).not.toContain('#38bdf8')
    for (const kind of AREA_KINDS) {
      expect(AREA_FILL_COLORS[kind]).not.toBe(KIND_META[kind].color)
    }
  })

  it('draws larger areas first so nested ones stay on top of opaque fills', () => {
    const small = area(1, 'S', square(0.2, 0.2, 0.1))
    const big = area(2, 'B', square(0, 0, 1))
    const fc = areaFeatureCollection([small, big], null)
    expect(fc.features.map((f) => f.properties.code)).toEqual(['B', 'S'])
  })
})

describe('AREA_FILL_OPACITY', () => {
  it('is solid enough to hide imagery aircraft, except for the selected area', () => {
    expect(AREA_FILL_OPACITY.solid).toBeGreaterThanOrEqual(0.95)
    expect(AREA_FILL_OPACITY.selected).toBeGreaterThanOrEqual(0.25)
    expect(AREA_FILL_OPACITY.selected).toBeLessThanOrEqual(0.4)
  })
})
