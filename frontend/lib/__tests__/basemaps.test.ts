import {
  BASEMAPS,
  BASEMAP_LAYER_ID,
  BASEMAP_SOURCE_ID,
  BASEMAP_STORAGE_KEY,
  DEFAULT_BASEMAP_ID,
  basemapLayer,
  basemapSource,
  buildMapStyle,
  getBasemap,
  isBasemapId,
  readStoredBasemapId
} from '@/lib/basemaps'
import { describe, expect, it } from 'vitest'

describe('BASEMAPS registry', () => {
  it('offers Esri World Imagery, which is the default', () => {
    expect(BASEMAPS.map((b) => b.id)).toEqual(['esri'])
    expect(DEFAULT_BASEMAP_ID).toBe('esri')
  })

  it('has unique ids and complete, well-formed entries', () => {
    expect(new Set(BASEMAPS.map((b) => b.id)).size).toBe(BASEMAPS.length)
    for (const b of BASEMAPS) {
      expect(b.label).not.toBe('')
      expect(b.attribution).not.toBe('')
      expect(b.tileSize).toBeGreaterThan(0)
      expect(b.minzoom).toBeLessThan(b.maxzoom)
      expect(b.tiles.length).toBeGreaterThan(0)
      for (const url of b.tiles) {
        expect(url).toMatch(/^https:\/\//)
        expect(url).toContain('{z}')
        expect(url).toContain('{x}')
        expect(url).toContain('{y}')
      }
    }
  })

  it('stops requesting Esri tiles at zoom 19, where its imagery ends, so MapLibre over-zooms', () => {
    expect(getBasemap('esri').maxzoom).toBe(19)
  })
})

describe('getBasemap / isBasemapId', () => {
  it('finds a basemap by id and falls back to the default for anything else', () => {
    expect(getBasemap('esri').id).toBe('esri')
    expect(getBasemap('nope').id).toBe(DEFAULT_BASEMAP_ID)
    expect(getBasemap(null).id).toBe(DEFAULT_BASEMAP_ID)
    expect(getBasemap(undefined).id).toBe(DEFAULT_BASEMAP_ID)
  })

  it('recognises only registered ids', () => {
    expect(isBasemapId('esri')).toBe(true)
    expect(isBasemapId('usgs')).toBe(false)
    expect(isBasemapId('mapbox')).toBe(false)
    expect(isBasemapId(null)).toBe(false)
  })
})

describe('style builders', () => {
  it('builds a raster source from a basemap, including its attribution and maxzoom', () => {
    const esri = getBasemap('esri')
    expect(basemapSource(esri)).toEqual({
      type: 'raster',
      tiles: [...esri.tiles],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: esri.attribution
    })
  })

  it('builds a one-layer style with glyphs for the area labels', () => {
    const style = buildMapStyle(getBasemap('esri'))
    expect(style.version).toBe(8)
    expect(style.glyphs).toBe(
      'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
    )
    expect(Object.keys(style.sources)).toEqual([BASEMAP_SOURCE_ID])
    expect(style.layers).toEqual([basemapLayer()])
    expect(basemapLayer()).toEqual({
      id: BASEMAP_LAYER_ID,
      type: 'raster',
      source: BASEMAP_SOURCE_ID
    })
  })

  it('uses the chosen basemap tiles in the style', () => {
    const style = buildMapStyle(getBasemap('esri'))
    const source = style.sources[BASEMAP_SOURCE_ID]
    expect(source.type).toBe('raster')
    expect('tiles' in source && source.tiles?.[0]).toContain('arcgisonline.com')
  })
})

describe('readStoredBasemapId', () => {
  const storage = (value: string | null | Error) => ({
    getItem: (key: string) => {
      expect(key).toBe(BASEMAP_STORAGE_KEY)
      if (value instanceof Error) throw value
      return value
    }
  })

  it('returns a stored, known id', () => {
    expect(readStoredBasemapId(storage('esri'))).toBe('esri')
  })

  it('falls back to the default for an id that is no longer registered (usgs)', () => {
    expect(readStoredBasemapId(storage('usgs'))).toBe(DEFAULT_BASEMAP_ID)
  })

  it('falls back to the default for nothing, an unknown id or unusable storage', () => {
    expect(readStoredBasemapId(storage(null))).toBe(DEFAULT_BASEMAP_ID)
    expect(readStoredBasemapId(storage('gone'))).toBe(DEFAULT_BASEMAP_ID)
    expect(readStoredBasemapId(storage(new Error('blocked')))).toBe(
      DEFAULT_BASEMAP_ID
    )
  })
})
