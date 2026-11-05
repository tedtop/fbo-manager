import { KIND_META, OTHER_COLOR, RAMP_COLOR } from '@/lib/parking-map'
// @ts-ignore -- @mapbox/mapbox-gl-draw ships no type declarations
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import { describe, expect, it } from 'vitest'
import { DRAW_EDIT_COLOR, DRAW_HALO_COLOR, DRAW_STYLES } from '../draw-styles'
import { applyMapLibreClassNames } from '../draw-support'

const byId = (id: string) => {
  const style = DRAW_STYLES.find((s) => s.id === id)
  if (!style) throw new Error(`no draw style ${id}`)
  return style
}

describe('DRAW_STYLES', () => {
  it('has unique ids with the gl-draw prefix the map click handler looks for', () => {
    const ids = DRAW_STYLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.startsWith('gl-draw')).toBe(true)
  })

  it('uses light blue for the fill and both outlines', () => {
    expect(DRAW_EDIT_COLOR).toBe('#38bdf8')
    expect(byId('gl-draw-polygon-fill').paint['fill-color']).toBe(
      DRAW_EDIT_COLOR
    )
    expect(byId('gl-draw-outline-drawing').paint['line-color']).toBe(
      DRAW_EDIT_COLOR
    )
    expect(byId('gl-draw-outline-editing').paint['line-color']).toBe(
      DRAW_EDIT_COLOR
    )
  })

  it('dashes the outline while drawing and keeps it solid while editing', () => {
    const drawing = byId('gl-draw-outline-drawing')
    const editing = byId('gl-draw-outline-editing')
    expect(drawing.paint).toHaveProperty('line-dasharray')
    expect(editing.paint).not.toHaveProperty('line-dasharray')
    expect(JSON.stringify(drawing.filter)).toContain('"draw_polygon"')
    expect(JSON.stringify(editing.filter)).toContain('"!="')
  })

  it('draws only the active shape (inactive features are left to the area layers)', () => {
    for (const id of [
      'gl-draw-polygon-fill',
      'gl-draw-outline-drawing',
      'gl-draw-outline-editing'
    ]) {
      expect(JSON.stringify(byId(id).filter)).toContain(
        '["==","active","true"]'
      )
    }
  })

  it('gives vertices and midpoints a white halo', () => {
    for (const id of ['gl-draw-vertex', 'gl-draw-midpoint']) {
      const paint = byId(id).paint
      expect(paint['circle-color']).toBe(DRAW_EDIT_COLOR)
      expect(paint['circle-stroke-color']).toBe(DRAW_HALO_COLOR)
      expect(paint['circle-stroke-width']).toBeGreaterThan(0)
    }
    expect(DRAW_HALO_COLOR).toBe('#ffffff')
  })

  it('keeps edit blue distinct from every area kind colour', () => {
    for (const { color } of Object.values(KIND_META)) {
      expect(color).not.toBe(DRAW_EDIT_COLOR)
    }
    const colors = Object.values(KIND_META).map((k) => k.color)
    expect(new Set(colors).size).toBe(colors.length)
    expect(RAMP_COLOR).toBe('#a78bfa')
    expect(OTHER_COLOR).toBe('#f472b6')
  })
})

describe('applyMapLibreClassNames', () => {
  it('points MapboxDraw at the maplibregl-* DOM classes', () => {
    applyMapLibreClassNames()
    const classes = MapboxDraw.constants.classes
    expect(classes.CANVAS).toBe('maplibregl-canvas')
    expect(classes.CONTROL_BASE).toBe('maplibregl-ctrl')
    expect(classes.CONTROL_PREFIX).toBe('maplibregl-ctrl-')
    expect(classes.CONTROL_GROUP).toBe('maplibregl-ctrl-group')
  })
})
