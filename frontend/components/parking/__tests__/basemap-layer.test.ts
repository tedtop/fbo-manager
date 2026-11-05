import {
  BASEMAP_LAYER_ID,
  BASEMAP_SOURCE_ID,
  type Basemap,
  getBasemap
} from '@/lib/basemaps'
import { describe, expect, it } from 'vitest'
import { swapBasemap } from '../basemap-layer'

type Layer = { id: string }

// A second provider, as a keyed one would be added to the registry later.
const other: Basemap = {
  id: 'other',
  label: 'Other imagery',
  tiles: ['https://tiles.example.com/{z}/{x}/{y}.jpg?key=k'],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 18,
  attribution: 'Example'
}

/** Just enough of a map to record how the basemap source and layer are replaced. */
function fakeMap(layers: Layer[], sources: Record<string, unknown>) {
  return {
    getLayer: (id: string) => layers.find((l) => l.id === id),
    removeLayer: (id: string) => {
      layers.splice(
        layers.findIndex((l) => l.id === id),
        1
      )
    },
    getSource: (id: string) => sources[id],
    removeSource: (id: string) => {
      delete sources[id]
    },
    addSource: (id: string, spec: unknown) => {
      sources[id] = spec
    },
    addLayer: (layer: Layer, beforeId?: string) => {
      const at = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1
      if (at === -1) layers.push(layer)
      else layers.splice(at, 0, layer)
    },
    getStyle: () => ({ layers: [...layers] })
  } as never
}

describe('swapBasemap', () => {
  it('replaces the basemap tiles and keeps every other layer and source', () => {
    const layers: Layer[] = [
      { id: BASEMAP_LAYER_ID },
      { id: 'parking-areas-fill' },
      { id: 'parking-areas-line' },
      { id: 'gl-draw-polygon-fill.hot' }
    ]
    const sources: Record<string, unknown> = {
      [BASEMAP_SOURCE_ID]: { old: true },
      'parking-areas': { type: 'geojson' }
    }
    swapBasemap(fakeMap(layers, sources), other)

    expect(layers.map((l) => l.id)).toEqual([
      BASEMAP_LAYER_ID,
      'parking-areas-fill',
      'parking-areas-line',
      'gl-draw-polygon-fill.hot'
    ])
    expect(sources['parking-areas']).toEqual({ type: 'geojson' })
    expect(sources[BASEMAP_SOURCE_ID]).toMatchObject({
      type: 'raster',
      maxzoom: 18
    })
  })

  it('puts the new basemap layer under everything else', () => {
    const layers: Layer[] = [{ id: 'parking-areas-fill' }]
    const sources: Record<string, unknown> = {}
    swapBasemap(fakeMap(layers, sources), getBasemap('esri'))
    expect(layers.map((l) => l.id)).toEqual([
      BASEMAP_LAYER_ID,
      'parking-areas-fill'
    ])
  })

  it('works on a map that has no basemap yet', () => {
    const layers: Layer[] = []
    const sources: Record<string, unknown> = {}
    swapBasemap(fakeMap(layers, sources), getBasemap('esri'))
    expect(layers.map((l) => l.id)).toEqual([BASEMAP_LAYER_ID])
    expect(Object.keys(sources)).toEqual([BASEMAP_SOURCE_ID])
  })
})
