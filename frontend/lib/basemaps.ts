import type {
  RasterLayerSpecification,
  RasterSourceSpecification,
  StyleSpecification
} from 'maplibre-gl'

/**
 * One raster imagery provider. Add an entry to BASEMAPS to offer another one (a keyed
 * provider needs its key inside the tile URL); the map shows a basemap selector as soon as
 * two or more are registered. The first entry is the default.
 */
export type Basemap = {
  id: string
  label: string
  /** Tile URL templates; several entries let the browser spread requests over hosts. */
  tiles: readonly string[]
  tileSize: number
  minzoom: number
  /** Highest zoom the provider really serves; MapLibre over-zooms those tiles beyond it. */
  maxzoom: number
  /** Text the provider requires next to the map. */
  attribution: string
}

export const BASEMAPS: readonly Basemap[] = [
  {
    id: 'esri',
    label: 'Esri World Imagery',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ],
    tileSize: 256,
    minzoom: 0,
    // Beyond 19 Esri answers with a "map data not yet available" placeholder tile.
    maxzoom: 19,
    attribution:
      '© Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }
]

export type BasemapId = string

export const DEFAULT_BASEMAP_ID: BasemapId = BASEMAPS[0].id

export const BASEMAP_STORAGE_KEY = 'fbo_map_basemap'

/** Id of the raster source and layer that hold the basemap inside the map style. */
export const BASEMAP_SOURCE_ID = 'basemap'
export const BASEMAP_LAYER_ID = 'basemap-layer'

// One font only: fonts.openmaptiles.org answers a multi-font stack with an HTML page.
const GLYPHS_URL = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'

export function isBasemapId(value: unknown): value is BasemapId {
  return BASEMAPS.some((b) => b.id === value)
}

/** The basemap for `id`, or the default one when `id` is unknown (e.g. a stale stored value). */
export function getBasemap(id: string | null | undefined): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
}

export function basemapSource(basemap: Basemap): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: [...basemap.tiles],
    tileSize: basemap.tileSize,
    minzoom: basemap.minzoom,
    maxzoom: basemap.maxzoom,
    attribution: basemap.attribution
  }
}

export function basemapLayer(): RasterLayerSpecification {
  return { id: BASEMAP_LAYER_ID, type: 'raster', source: BASEMAP_SOURCE_ID }
}

/** The initial map style: just the chosen basemap; area layers and Draw are added later. */
export function buildMapStyle(basemap: Basemap): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: { [BASEMAP_SOURCE_ID]: basemapSource(basemap) },
    layers: [basemapLayer()]
  }
}

/** Reads the stored choice; unusable storage or an unknown id means the default. */
export function readStoredBasemapId(
  storage: Pick<Storage, 'getItem'>
): BasemapId {
  try {
    const stored = storage.getItem(BASEMAP_STORAGE_KEY)
    return isBasemapId(stored) ? stored : DEFAULT_BASEMAP_ID
  } catch {
    return DEFAULT_BASEMAP_ID
  }
}
