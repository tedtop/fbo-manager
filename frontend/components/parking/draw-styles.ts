/** Colour of the shape being drawn or edited: its own colour, apart from every area kind. */
export const DRAW_EDIT_COLOR = '#38bdf8'
export const DRAW_HALO_COLOR = '#ffffff'

const ACTIVE = ['==', 'active', 'true']
const IS_OUTLINE = [
  'any',
  ['==', '$type', 'LineString'],
  ['==', '$type', 'Polygon']
]
const IS_VERTEX = ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']]

/**
 * Layer styles for MapboxDraw. Draw copies each style into its hot and cold sources (adding
 * `.hot` / `.cold` to the id), sets `active` to 'true' on the shape being worked on and `mode`
 * to the current mode on every feature it renders.
 *
 * Only the active shape is drawn: inactive Draw features are skipped because the area layers
 * already show every saved boundary. The ids keep the `gl-draw` prefix, which the map click
 * handler uses to tell a click on the editable shape from a click on empty map.
 */
export const DRAW_STYLES = [
  // Fill of the shape in progress or being edited
  {
    id: 'gl-draw-polygon-fill',
    type: 'fill',
    filter: ['all', ['==', '$type', 'Polygon'], ACTIVE],
    paint: { 'fill-color': DRAW_EDIT_COLOR, 'fill-opacity': 0.18 }
  },
  // Dashed outline and in-progress line while drawing
  {
    id: 'gl-draw-outline-drawing',
    type: 'line',
    filter: ['all', IS_OUTLINE, ACTIVE, ['==', 'mode', 'draw_polygon']],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': DRAW_EDIT_COLOR,
      'line-width': 3,
      'line-dasharray': [2, 2]
    }
  },
  // Solid outline while editing
  {
    id: 'gl-draw-outline-editing',
    type: 'line',
    filter: ['all', IS_OUTLINE, ACTIVE, ['!=', 'mode', 'draw_polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DRAW_EDIT_COLOR, 'line-width': 3 }
  },
  // Corners; the one being dragged is larger
  {
    id: 'gl-draw-vertex',
    type: 'circle',
    filter: ['all', IS_VERTEX, ['!=', 'mode', 'simple_select']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 8, 6],
      'circle-color': DRAW_EDIT_COLOR,
      'circle-stroke-color': DRAW_HALO_COLOR,
      'circle-stroke-width': 2.5
    }
  },
  // Midpoints: drag one to add a corner (on a rectangle they are side handles instead, a
  // little larger, and drag just that side)
  {
    id: 'gl-draw-midpoint',
    type: 'circle',
    filter: ['==', 'meta', 'midpoint'],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'rect'], 'true'], 5.5, 4],
      'circle-color': DRAW_EDIT_COLOR,
      'circle-stroke-color': DRAW_HALO_COLOR,
      'circle-stroke-width': 2
    }
  }
]
