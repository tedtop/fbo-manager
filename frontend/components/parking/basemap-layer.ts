import {
  BASEMAP_LAYER_ID,
  BASEMAP_SOURCE_ID,
  type Basemap,
  basemapLayer,
  basemapSource
} from '@/lib/basemaps'
import type { Map as MapLibreMap } from 'maplibre-gl'

type BasemapMap = Pick<
  MapLibreMap,
  | 'getLayer'
  | 'removeLayer'
  | 'getSource'
  | 'removeSource'
  | 'addSource'
  | 'addLayer'
  | 'getStyle'
>

/**
 * Replaces the raster basemap in place. Only the basemap source and layer change, so the
 * area layers, the Draw layers and the plane markers keep their state (`setStyle` would drop
 * every source and layer that is not in the new style). The new layer goes back to the
 * bottom of the stack, under everything else, and the attribution control follows the source.
 */
export function swapBasemap(map: BasemapMap, basemap: Basemap): void {
  if (map.getLayer(BASEMAP_LAYER_ID)) map.removeLayer(BASEMAP_LAYER_ID)
  if (map.getSource(BASEMAP_SOURCE_ID)) map.removeSource(BASEMAP_SOURCE_ID)
  map.addSource(BASEMAP_SOURCE_ID, basemapSource(basemap))
  const [bottom] = map.getStyle().layers
  map.addLayer(basemapLayer(), bottom?.id)
}
