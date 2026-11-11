import { MercatorCoordinate } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import {
  METERS_PER_PIXEL_AT_ZOOM_0,
  metersPerPixel,
  metersToPixels
} from '../map-scale'

describe('map scale', () => {
  it('is the 512px-tile equator resolution at zoom 0', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.51696, 4)
    expect(METERS_PER_PIXEL_AT_ZOOM_0).toBeCloseTo(40_075_016.686 / 512, 3)
  })

  it('halves at each zoom level', () => {
    expect(metersPerPixel(46.9, 18)).toBeCloseTo(
      metersPerPixel(46.9, 17) / 2,
      9
    )
    expect(metersPerPixel(46.9, 19.5)).toBeCloseTo(
      metersPerPixel(46.9, 17) / 2 ** 2.5,
      9
    )
  })

  it('shrinks with the cosine of latitude', () => {
    expect(metersPerPixel(60, 10)).toBeCloseTo(metersPerPixel(0, 10) / 2, 6)
    expect(metersPerPixel(-60, 10)).toBeCloseTo(metersPerPixel(60, 10), 9)
    // KMSO, zoom 18: about 0.2 m per pixel
    expect(metersPerPixel(46.92, 18)).toBeCloseTo(0.2042, 3)
  })

  it('converts metres to pixels', () => {
    expect(metersToPixels(1, 0, 0)).toBeCloseTo(1 / 78_271.51696, 12)
    // a 11 m wingspan at KMSO zoom 19 is ~108 px; one zoom level doubles it
    const z19 = metersToPixels(11, 46.92, 19)
    expect(z19).toBeCloseTo(107.8, 0)
    expect(metersToPixels(11, 46.92, 20)).toBeCloseTo(z19 * 2, 9)
    expect(metersToPixels(0, 46.92, 19)).toBe(0)
  })

  it('matches the web-mercator pixel grid (512px world, 360 degrees across)', () => {
    // 100 px of longitude at the zoom, converted with the spherical-mercator radius.
    const R = 6_378_137
    for (const [lat, zoom] of [
      [0, 3],
      [46.92, 18],
      [-33.9, 15.5],
      [64, 12]
    ]) {
      const dLng = (100 * 360) / (512 * 2 ** zoom)
      const meters =
        ((dLng * Math.PI) / 180) * R * Math.cos((lat * Math.PI) / 180)
      expect(100 * metersPerPixel(lat, zoom)).toBeCloseTo(meters, 6)
    }
  })

  it("stays within 0.2% of MapLibre's own mercator metre unit", () => {
    // MapLibre derives its unit from the mean earth radius (6371008.8 m), 0.11% smaller.
    for (const [lat, zoom] of [
      [0, 3],
      [46.92, 18],
      [-33.9, 15.5],
      [64, 12]
    ]) {
      const unit = MercatorCoordinate.fromLngLat({
        lng: 0,
        lat
      }).meterInMercatorCoordinateUnits()
      const pxPerMeter = unit * 512 * 2 ** zoom
      expect(1 / metersPerPixel(lat, zoom) / pxPerMeter).toBeCloseTo(1, 2)
      expect(
        Math.abs(1 / metersPerPixel(lat, zoom) / pxPerMeter - 1)
      ).toBeLessThan(0.002)
    }
  })
})
