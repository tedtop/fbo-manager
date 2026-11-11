import { AREA_FILL_OPACITY, areaFeatureCollection } from '@/lib/parking-map'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

const SOURCE_ID = 'parking-areas'

/**
 * Draws every active area as fill + outline + code label, coloured by kind. Creates the
 * source and layers on first call and only replaces the data afterwards. `hiddenId` omits an
 * area while MapboxDraw is showing its editable copy.
 *
 * Stack, bottom to top: imagery, fills, outlines, labels, then Draw (the layers are inserted
 * below any Draw layer that exists already). Fills are solid so they hide the aircraft in the
 * imagery; only the selected area stays see-through, so its boundary can be lined up with the
 * buildings. The plane markers are DOM elements, so they sit above every map layer.
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
  // Draw may have installed its layers before the first sync; the areas go beneath them.
  const beforeId = map
    .getStyle()
    .layers.find((layer) => layer.id.startsWith('gl-draw'))?.id
  map.addLayer(
    {
      id: `${SOURCE_ID}-fill`,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        // Selected: the bright kind colour, see-through. Otherwise the solid dark fill.
        'fill-color': [
          'case',
          ['get', 'selected'],
          ['get', 'color'],
          ['get', 'fillColor']
        ],
        'fill-opacity': [
          'case',
          ['get', 'selected'],
          AREA_FILL_OPACITY.selected,
          AREA_FILL_OPACITY.solid
        ]
      }
    },
    beforeId
  )
  map.addLayer(
    {
      id: `${SOURCE_ID}-line`,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': [
          'case',
          ['get', 'selected'],
          '#ffffff',
          ['get', 'color']
        ],
        'line-width': ['case', ['get', 'selected'], 4, 2.5]
      }
    },
    beforeId
  )
  map.addLayer(
    {
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
        // Wide dark halo: readable on the solid fills and on the see-through selected area
        'text-halo-color': '#000000',
        'text-halo-width': 3
      }
    },
    beforeId
  )
}
