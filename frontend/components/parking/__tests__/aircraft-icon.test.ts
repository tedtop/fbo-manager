import { SILHOUETTE_CATEGORIES } from '@/lib/aircraft-dimensions'
import { describe, expect, it } from 'vitest'
import {
  ICON_PAD,
  PLANE_SELECTED_STROKE,
  PLANE_STROKE,
  aircraftIconUrl,
  buildAircraftSvg,
  MIN_ICON_LONG_SIDE_PX,
  paddedSize,
  withMinimumSize
} from '../aircraft-icon'

describe('aircraft icon', () => {
  it('stretches the padded silhouette box to any wingspan x length', () => {
    const svg = buildAircraftSvg('single-high', false)
    expect(svg).toContain(
      `viewBox="-${ICON_PAD} -${ICON_PAD} ${100 + 2 * ICON_PAD} ${100 + 2 * ICON_PAD}"`
    )
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain('vector-effect="non-scaling-stroke"')
  })

  it('pads the img so the drawn art keeps the true size', () => {
    const { width, height } = paddedSize(100, 50)
    expect(width).toBeCloseTo(106)
    expect(height).toBeCloseTo(53)
  })

  it('draws the selected plane with an amber outline', () => {
    expect(buildAircraftSvg('airliner', true)).toContain(PLANE_SELECTED_STROKE)
    expect(buildAircraftSvg('airliner', true)).not.toContain(
      `stroke="${PLANE_STROKE}"`
    )
    expect(buildAircraftSvg('airliner', false)).toContain(
      `stroke="${PLANE_STROKE}"`
    )
    expect(buildAircraftSvg('airliner', false)).not.toContain(
      PLANE_SELECTED_STROKE
    )
  })

  it('has a distinct, well-formed silhouette for every category', () => {
    const seen = new Set<string>()
    for (const category of SILHOUETTE_CATEGORIES) {
      const svg = buildAircraftSvg(category, false, 0.86)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).not.toContain('NaN')
      expect(svg.endsWith('</svg>')).toBe(true)
      seen.add(svg)
    }
    expect(seen.size).toBe(SILHOUETTE_CATEGORIES.length)
  })

  it('only varies a helicopter with its rotor aspect', () => {
    expect(buildAircraftSvg('helicopter', false, 0.8)).not.toBe(
      buildAircraftSvg('helicopter', false, 0.9)
    )
    expect(buildAircraftSvg('airliner', false, 0.8)).toBe(
      buildAircraftSvg('airliner', false, 0.9)
    )
  })

  it('is a self-contained, cached data URL', () => {
    const url = aircraftIconUrl('light-jet', false)
    expect(url.startsWith('data:image/svg+xml;charset=UTF-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',')[1])).toBe(
      buildAircraftSvg('light-jet', false)
    )
    expect(aircraftIconUrl('light-jet', false)).toBe(url)
    expect(aircraftIconUrl('light-jet', true)).not.toBe(url)
  })
})

describe('withMinimumSize', () => {
  it('scales a tiny silhouette up to the minimum long side, keeping the aspect ratio', () => {
    const { width, height } = withMinimumSize(6, 4)
    expect(Math.max(width, height)).toBeCloseTo(MIN_ICON_LONG_SIDE_PX)
    expect(width / height).toBeCloseTo(1.5)
  })

  it('leaves a silhouette that is already big enough alone', () => {
    expect(withMinimumSize(80, 60)).toEqual({ width: 80, height: 60 })
  })

  it('does not blow up on a zero size', () => {
    expect(withMinimumSize(0, 0)).toEqual({ width: 0, height: 0 })
  })
})
