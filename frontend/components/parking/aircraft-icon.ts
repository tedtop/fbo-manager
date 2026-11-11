import type { SilhouetteCategory } from '@/lib/aircraft-dimensions'
import { silhouetteParts } from '@/lib/aircraft-silhouettes'

export const PLANE_FILL = '#ffffff'
export const PLANE_STROKE = '#111827'
export const PLANE_SELECTED_STROKE = '#f59e0b'

/**
 * The art is drawn in a 100x100 box but the SVG viewBox is padded by this many units on every
 * side so outlines at the wing tips and nose are not clipped. The <img> must therefore be
 * (100 + 2 * ICON_PAD) / 100 times the real wingspan x length (see `paddedSize`).
 */
export const ICON_PAD = 3

/** Pixel size of the <img> that draws a silhouette at exactly `width` x `height` px. */
export function paddedSize(
  width: number,
  height: number
): { width: number; height: number } {
  const k = (100 + 2 * ICON_PAD) / 100
  return { width: width * k, height: height * k }
}

/**
 * Top-down aircraft silhouette, nose up. The 100x100 box is stretched to the real wingspan x
 * length of the aircraft type (preserveAspectRatio="none"), so the SVG itself does not depend
 * on size or zoom. Strokes use non-scaling-stroke to stay crisp when stretched. `aspect`
 * (wingspan / length) only matters for helicopters, whose rotor disc is a circle on the map.
 */
export function buildAircraftSvg(
  category: SilhouetteCategory,
  selected: boolean,
  aspect = 1
): string {
  const stroke = selected ? PLANE_SELECTED_STROKE : PLANE_STROKE
  const width = selected ? 3 : 1.5
  const common = `vector-effect="non-scaling-stroke" stroke-linejoin="round"`
  const body = silhouetteParts(category, aspect)
    .map(({ d, role }) => {
      switch (role) {
        case 'canopy':
          return `<path d="${d}" fill="${PLANE_STROKE}" fill-opacity="0.45" stroke="none"/>`
        case 'line':
          return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-opacity="0.7" ${common}/>`
        case 'disc':
          return `<path d="${d}" fill="${PLANE_FILL}" fill-opacity="0.18" stroke="${stroke}" stroke-width="1" stroke-opacity="0.8" stroke-dasharray="4 3" ${common}/>`
        default:
          return `<path d="${d}" fill="${PLANE_FILL}" stroke="${stroke}" stroke-width="${width}" ${common}/>`
      }
    })
    .join('')
  const box = 100 + 2 * ICON_PAD
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-ICON_PAD} ${-ICON_PAD} ${box} ${box}" preserveAspectRatio="none">${body}</svg>`
}

const urlCache = new Map<string, string>()

/** Data URL of a silhouette; cached because every marker of a category shares it. */
export function aircraftIconUrl(
  category: SilhouetteCategory,
  selected: boolean,
  aspect = 1
): string {
  // Only helicopters depend on the aspect; round it so a handful of variants share a URL.
  const a = category === 'helicopter' ? Math.round(aspect * 100) / 100 : 1
  const key = `${category}|${selected}|${a}`
  let url = urlCache.get(key)
  if (!url) {
    url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildAircraftSvg(category, selected, a))}`
    urlCache.set(key, url)
  }
  return url
}
