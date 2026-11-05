// Pure page-rotation maths for scanned sheets. Angles are clockwise degrees in image coordinates (y down).

export type Rotation = 0 | 90 | 180 | 270

/** Any whole number of degrees -> 0, 90, 180 or 270 (rounded to the nearest quarter turn). */
export function normalizeRotation(deg: number): Rotation {
  const q = ((Math.round(deg / 90) % 4) + 4) % 4
  return (q * 90) as Rotation
}

/** Clockwise turn that makes upright a page whose text runs at `textAngleDeg` (clockwise from left-to-right). */
export function rotationFromAngle(textAngleDeg: number): Rotation {
  return normalizeRotation(-textAngleDeg)
}

/** True when the angle is within `toleranceDeg` of a right angle, i.e. the quarter-turn guess can be trusted. */
export function isNearQuarterTurn(angleDeg: number, toleranceDeg = 25): boolean {
  const r = ((angleDeg % 90) + 90) % 90
  return Math.min(r, 90 - r) <= toleranceDeg
}

/** Adds a further clockwise turn (negative = counter-clockwise) to the turn already applied. */
export function addRotation(current: Rotation, deltaDeg: number): Rotation {
  return normalizeRotation(current + deltaDeg)
}

/** Pixel size of a w x h image after turning it clockwise by `rotation`. */
export function rotatedSize(w: number, h: number, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: h, height: w } : { width: w, height: h }
}

/** Scale that fits the longest side into maxSide, never enlarging. */
export function fitScale(w: number, h: number, maxSide: number): number {
  const longest = Math.max(w, h)
  return longest > maxSide ? maxSide / longest : 1
}
