import { areaFeatureCollection } from '@/lib/parking-map'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

const SOURCE_ID = 'parking-areas'

/**
 * Draws every active area as fill + outline + code label, coloured by kind. Creates the
 * source and layers on first call and only replaces the data afterwards. `hiddenId` omits an
 * area while MapboxDraw is showing its editable copy.
 */
export function syncAreaLayers(
  map: MapLibreMap,
  areas: readonly ParkingAreaRow[],
  selectedId: number | null,
  hiddenId: number | null
): void {
  const data = areaFeatureCollection(areas, selectedId, hiddenId)
  const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
  if (existing) {
    existing.setData(data)
    return
  }

  map.addSource(SOURCE_ID, { type: 'geojson', data })
  map.addLayer({
    id: `${SOURCE_ID}-fill`,
    type: 'fill',
    source: SOURCE_ID,
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['case', ['get', 'selected'], 0.42, 0.22]
    }
  })
  map.addLayer({
    id: `${SOURCE_ID}-line`,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': ['case', ['get', 'selected'], '#ffffff', ['get', 'color']],
      'line-width': ['case', ['get', 'selected'], 4, 2]
    }
  })
  map.addLayer({
    id: `${SOURCE_ID}-label`,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['get', 'code'],
      // One font only: fonts.openmaptiles.org answers a multi-font stack with an HTML page
      'text-font': ['Open Sans Bold'],
      'text-size': 15,
      'text-allow-overlap': true
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 2.5
    }
  })
}
