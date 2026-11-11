import { normalizeHeading, toStoredHeading } from '@/lib/parking-map'

// Maths behind the compass rose in the aircraft drawer (components/parking/compass-rose.tsx).
// Headings are true degrees, 0 = north, clockwise, stored as whole degrees 0..359. The rose is
// drawn on screen, and the map can be rotated, so "screen angle" (0 = top of the screen,
// clockwise) differs from the true heading by the map bearing: screen = heading - bearing.

export type RoseCardinal = 'N' | 'E' | 'S' | 'W'

export type RoseTick = {
  /** True heading the tick stands for. */
  heading: number
  /** Where it is drawn: degrees clockwise from the top of the screen. */
  screenAngle: number
  kind: 'major' | 'medium' | 'minor'
}

/** Screen angle (0..360, clockwise from screen up) of a true heading on a map turned by `mapBearing`. */
export function headingToScreenAngle(
  heading: number,
  mapBearing: number
): number {
  return normalizeHeading(heading - mapBearing)
}

/**
 * True heading of a point on the rose, given its offset from the rose centre in screen pixels
 * (`dx` right-positive, `dy` down-positive). Null right at the centre, where there is no
 * direction to read.
 */
export function pointerToHeading(
  dx: number,
  dy: number,
  mapBearing: number
): number | null {
  if (Math.hypot(dx, dy) < 1e-6) return null
  // atan2(dx, -dy) is the clockwise angle from screen up.
  const screenAngle = (Math.atan2(dx, -dy) * 180) / Math.PI
  return toStoredHeading(screenAngle + mapBearing)
}

/** Screen angle of each cardinal mark: north sits at -mapBearing, so it follows the map. */
export function cardinalScreenAngles(
  mapBearing: number
): Record<RoseCardinal, number> {
  return {
    N: headingToScreenAngle(0, mapBearing),
    E: headingToScreenAngle(90, mapBearing),
    S: headingToScreenAngle(180, mapBearing),
    W: headingToScreenAngle(270, mapBearing)
  }
}

/** Degree ticks: minor every 10 degrees, medium every 30, major at the four cardinals. */
export function roseTicks(mapBearing: number): RoseTick[] {
  const ticks: RoseTick[] = []
  for (let heading = 0; heading < 360; heading += 10) {
    ticks.push({
      heading,
      screenAngle: headingToScreenAngle(heading, mapBearing),
      kind:
        heading % 90 === 0 ? 'major' : heading % 30 === 0 ? 'medium' : 'minor'
    })
  }
  return ticks
}

/**
 * New heading for a key pressed on the focused rose, or null when the key does nothing here.
 * Left/Down turn counter-clockwise, Right/Up clockwise, 1 degree (10 with Shift), wrapping at
 * north; Home sets north.
 */
export function keyboardHeading(
  heading: number,
  key: string,
  shift = false
): number | null {
  const step = shift ? 10 : 1
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return toStoredHeading(heading - step)
    case 'ArrowRight':
    case 'ArrowUp':
      return toStoredHeading(heading + step)
    case 'Home':
      return 0
    default:
      return null
  }
}

/**
 * Size of a wingspan x length silhouette scaled (aspect kept) so it fits a circle of `radius`
 * whatever its rotation: half the diagonal equals the radius.
 */
export function fitSilhouette(
  width: number,
  height: number,
  radius: number
): { width: number; height: number } {
  const halfDiagonal = Math.hypot(width, height) / 2
  if (halfDiagonal <= 0) return { width: 0, height: 0 }
  const k = radius / halfDiagonal
  return { width: width * k, height: height * k }
}
