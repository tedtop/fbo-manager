export const PLANE_FILL = '#ffffff'
export const PLANE_STROKE = '#111827'
export const PLANE_SELECTED_STROKE = '#f59e0b'

/**
 * Top-down aircraft silhouette, nose up, drawn in a 100x100 box. The box is stretched to the
 * real wingspan x length of the aircraft type (preserveAspectRatio="none"), so the SVG itself
 * does not depend on size or zoom. Strokes use non-scaling-stroke to stay crisp when stretched.
 */
export function buildAircraftSvg(selected: boolean): string {
  const stroke = selected ? PLANE_SELECTED_STROKE : PLANE_STROKE
  const width = selected ? 3 : 1.5
  const attrs = `fill="${PLANE_FILL}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke" stroke-linejoin="round"`
  const body = [
    `<path ${attrs} d="M 45 2 C 45 0 55 0 55 2 L 56 30 L 56 92 C 56 98 54 100 50 100 C 46 100 44 98 44 92 L 44 30 Z"/>`,
    `<path ${attrs} d="M 44 35 L 0 55 L 0 65 L 44 50 Z M 56 35 L 100 55 L 100 65 L 56 50 Z"/>`,
    `<path ${attrs} d="M 46 90 L 30 98 L 30 100 L 46 95 Z M 54 90 L 70 98 L 70 100 L 54 95 Z"/>`
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`
}

export function aircraftIconUrl(selected: boolean): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildAircraftSvg(selected))}`
}
