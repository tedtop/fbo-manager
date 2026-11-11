/**
 * Ground scale of the MapLibre GL web-mercator map. MapLibre renders a 512px world tile, so
 * at zoom 0 one CSS pixel at the equator spans the spherical-mercator circumference
 * (2 pi x 6_378_137 m, the EPSG:3857 radius the tiles are cut in) / 512 = 78_271.517 m.
 * MapLibre's own `meterInMercatorCoordinateUnits` uses the mean earth radius instead and
 * differs by 0.11%, which is far below what is visible on a ramp.
 */
export const METERS_PER_PIXEL_AT_ZOOM_0 = (2 * Math.PI * 6_378_137) / 512

/** Metres on the ground covered by one CSS pixel at a latitude and (fractional) zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (
    (METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
  )
}

/** Length in CSS pixels of a real-world length in metres at a latitude and zoom. */
export function metersToPixels(
  meters: number,
  lat: number,
  zoom: number
): number {
  return meters / metersPerPixel(lat, zoom)
}
