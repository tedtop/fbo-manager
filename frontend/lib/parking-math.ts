/**
 * Pure math functions for the parking map.
 * All functions are stateless and free of browser / React APIs.
 * Convention throughout: "bearing" = navigation heading (0 = North, CW positive).
 */

/**
 * Wrap any angle to [0, 360).
 */
export function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * Shortest signed delta from `from` to `to`, in [-180, 180].
 * Use this to drive rotation animations so they always take the short way around.
 */
export function shortestRotationDelta(from: number, to: number): number {
  let delta = (to - from) % 360
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return delta
}

/**
 * Web Mercator ground resolution in metres per pixel.
 * Standard formula: 156543.03392 * cos(lat) / 2^zoom
 *
 * @param lat  - Latitude in degrees
 * @param zoom - Mapbox zoom level
 */
export function metersPerPixelAtZoom(lat: number, zoom: number): number {
  return 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom)
}

/**
 * Ground resolution in feet per pixel at a given latitude and zoom.
 * Converts the Web Mercator metre scale (1 m = 3.28084 ft).
 *
 * @param lat  - Latitude in degrees
 * @param zoom - Mapbox zoom level
 */
export function feetPerPixelAtZoom(lat: number, zoom: number): number {
  return metersPerPixelAtZoom(lat, zoom) * 3.28084
}

/**
 * Compute the lat/lng deltas for one movement step in a given bearing direction.
 *
 * The longitude delta is corrected for Mercator distortion at `lat` so the
 * aircraft moves the same real-world distance regardless of direction.
 *
 * @param bearing - True heading [0, 360), 0 = North, 90 = East
 * @param stepDeg - Movement magnitude in degrees of latitude (small value like 0.000005)
 * @param lat     - Current latitude in degrees (used for longitude correction)
 * @returns { dLat, dLng } — add these to the current position
 */
export function aircraftMoveDeltas(
  bearing: number,
  stepDeg: number,
  lat: number
): { dLat: number; dLng: number } {
  // Convert nav bearing (0=N, CW) → math angle (0=E, CCW): mathAngle = 90 - bearing
  const mathRad = ((90 - bearing) * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  return {
    dLat: stepDeg * Math.sin(mathRad),
    dLng: (stepDeg * Math.cos(mathRad)) / Math.cos(latRad),
  }
}

/**
 * CSS `rotate()` angle for a compass icon showing a true heading on a rotated map.
 *
 * The Lucide <Plane> icon points upper-right at 0° CSS rotation, requiring a
 * −45° offset to make it point "up". Subtracting `mapBearing` converts the true
 * heading to a map-relative visual direction.
 *
 * cssAngle = trueHeading − mapBearing − iconOffsetDeg
 *
 * @param trueHeading    - Geographic heading in degrees
 * @param mapBearing     - Current map rotation in degrees
 * @param iconOffsetDeg  - Natural icon offset (default 45 for Lucide Plane)
 * @returns Degrees to pass to CSS `rotate()`
 */
export function trueHeadingToCssRotation(
  trueHeading: number,
  mapBearing: number,
  iconOffsetDeg = 45
): number {
  return trueHeading - mapBearing - iconOffsetDeg
}

/**
 * Convert a mouse pointer position on a compass widget to a true heading.
 *
 * All coordinates are in the same reference frame (e.g. viewport px).
 * The pointer's clockwise angle from the compass center (0° = "Map Up") is
 * treated as a visual direction, then shifted by `mapBearing` to get the
 * true geographic heading.
 *
 * @param pointerX  - Mouse clientX
 * @param pointerY  - Mouse clientY
 * @param centerX   - Compass center clientX (from getBoundingClientRect)
 * @param centerY   - Compass center clientY (from getBoundingClientRect)
 * @param mapBearing - Current map rotation in degrees
 * @returns True heading in [0, 360)
 */
export function pointerToTrueHeading(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
  mapBearing: number
): number {
  const x = pointerX - centerX
  const y = pointerY - centerY
  // atan2(y, x): 0 at East; screen y increases downward so CCW in math = CW on screen
  // + 90 rotates origin from East to North (top of screen), giving clockwise-from-North
  const visualDeg = (Math.atan2(y, x) * 180) / Math.PI + 90
  return normalizeBearing(visualDeg + mapBearing)
}

/**
 * True heading for a cardinal visual direction on the current map.
 *
 * "Up" on the screen corresponds to `mapBearing` degrees true north.
 * Each 90° step adds to that base.
 *
 * @param visualDir  - Screen direction: 'up' | 'right' | 'down' | 'left'
 * @param mapBearing - Current map rotation in degrees
 * @returns True heading in [0, 360)
 */
export function mapDirectionToHeading(
  visualDir: 'up' | 'right' | 'down' | 'left',
  mapBearing: number
): number {
  const offsets: Record<typeof visualDir, number> = {
    up: 0,
    right: 90,
    down: 180,
    left: 270,
  }
  return normalizeBearing(offsets[visualDir] + mapBearing)
}
