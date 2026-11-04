import { describe, expect, it } from 'vitest'
import {
  PLANE_SELECTED_STROKE,
  PLANE_STROKE,
  aircraftIconUrl,
  buildAircraftSvg
} from '../aircraft-icon'

describe('aircraft icon', () => {
  it('stretches a 100x100 silhouette to any wingspan x length', () => {
    const svg = buildAircraftSvg(false)
    expect(svg).toContain('viewBox="0 0 100 100"')
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain('vector-effect="non-scaling-stroke"')
  })

  it('draws the selected plane with an amber outline', () => {
    expect(buildAircraftSvg(true)).toContain(PLANE_SELECTED_STROKE)
    expect(buildAircraftSvg(true)).not.toContain(PLANE_STROKE)
    expect(buildAircraftSvg(false)).toContain(PLANE_STROKE)
    expect(buildAircraftSvg(false)).not.toContain(PLANE_SELECTED_STROKE)
  })

  it('is a self-contained data URL', () => {
    const url = aircraftIconUrl(false)
    expect(url.startsWith('data:image/svg+xml;charset=UTF-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',')[1])).toBe(buildAircraftSvg(false))
  })
})
