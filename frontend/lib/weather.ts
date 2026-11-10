// KMSO weather helpers, ported from Minuteman's public/weather-widget.js (same sources, same maths):
// Open-Meteo for outside conditions, aviationweather.gov (via /api/metar) for the METAR.

export const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=46.916&longitude=-114.090&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph'
export const KMSO_ELEVATION_FT = 3206

// WMO weather codes -> [icon, label]
export const WEATHER_CODES: Record<number, [string, string]> = {
  0: ['☀️', 'Clear'],
  1: ['🌤️', 'Mostly Clear'],
  2: ['⛅', 'Partly Cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'],
  48: ['🌫️', 'Fog'],
  51: ['🌦️', 'Light Drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌦️', 'Heavy Drizzle'],
  56: ['🌧️', 'Freezing Drizzle'],
  57: ['🌧️', 'Freezing Drizzle'],
  61: ['🌧️', 'Light Rain'],
  63: ['🌧️', 'Rain'],
  65: ['🌧️', 'Heavy Rain'],
  66: ['🌧️', 'Freezing Rain'],
  67: ['🌧️', 'Freezing Rain'],
  71: ['🌨️', 'Light Snow'],
  73: ['🌨️', 'Snow'],
  75: ['❄️', 'Heavy Snow'],
  77: ['❄️', 'Snow Grains'],
  80: ['🌦️', 'Rain Showers'],
  81: ['🌧️', 'Rain Showers'],
  82: ['⛈️', 'Heavy Showers'],
  85: ['🌨️', 'Snow Showers'],
  86: ['🌨️', 'Snow Showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm'],
  99: ['⛈️', 'Thunderstorm']
}

const WIND_COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const windCompass = (degrees: number): string => WIND_COMPASS[Math.round(degrees / 22.5) % 16]

export interface CurrentWeather {
  temperature_2m: number
  relative_humidity_2m: number
  weather_code: number
  wind_speed_10m: number
  wind_direction_10m: number
}

export interface Metar {
  fltCat?: string
  clouds?: { cover: string; base: number }[]
  visib?: string | number
  altim?: number
  elev?: number
  temp?: number
  dewp?: number
  obsTime?: number
  rawOb?: string
}

/** "2026-06-13T05:41" (Open-Meteo local time) -> "5:41 AM". */
export function formatIsoTimeOfDay(iso: string): string {
  const [hourStr, minuteStr] = iso.split('T')[1].split(':')
  const hour = Number(hourStr)
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minuteStr} ${hour >= 12 ? 'PM' : 'AM'}`
}

/** Lowest BKN/OVC layer forms the ceiling; otherwise there is none. */
export function ceilingFromClouds(clouds: Metar['clouds']): string {
  const layer = (clouds ?? []).find((c) => c.cover === 'BKN' || c.cover === 'OVC')
  return layer ? `${layer.base.toLocaleString()} ft ${layer.cover}` : 'None'
}

/** Altimeter, pressure altitude and density altitude from a METAR (hPa altim, deg C temp). */
export function altitudes(metar: Metar) {
  if (typeof metar.altim !== 'number') return null
  const altimeterInHg = metar.altim / 33.8639
  const elevationFt = typeof metar.elev === 'number' ? metar.elev * 3.28084 : KMSO_ELEVATION_FT
  const pressureAltFt = (29.92 - altimeterInHg) * 1000 + elevationFt
  let densityAltFt: number | null = null
  if (typeof metar.temp === 'number') {
    const isaTempC = 15 - 2 * (pressureAltFt / 1000)
    densityAltFt = pressureAltFt + 120 * (metar.temp - isaTempC)
  }
  return { altimeterInHg, pressureAltFt, densityAltFt }
}
