/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param point [longitude, latitude]
 * @param polygon Array of [longitude, latitude] coordinates
 * @returns true if point is inside polygon
 */
export function pointInPolygon(
  point: [number, number],
  polygon: number[][]
): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Find which parking location polygon contains a given point
 * @param point [longitude, latitude]
 * @param parkingLocations Array of parking locations with polygons
 * @returns The parking location that contains the point, or null
 */
export function findParkingLocationAtPoint(
  point: [number, number],
  parkingLocations: Array<{
    id: number
    location_code: string
    polygon: number[][] | null
  }>
): { id: number; location_code: string } | null {
  for (const location of parkingLocations) {
    if (location.polygon && pointInPolygon(point, location.polygon)) {
      return {
        id: location.id,
        location_code: location.location_code,
      }
    }
  }
  return null
}
