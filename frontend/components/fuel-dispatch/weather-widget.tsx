'use client'

import { altitudes, ceilingFromClouds, formatIsoTimeOfDay, WEATHER_CODES, windCompass } from '@/lib/weather'
import type { useWeather } from '@/hooks/use-weather'
import { useEffect, useState } from 'react'

// KMSO weather card shown in the Fuel Dispatch header (desktop only), ported from Minuteman's
// weather-widget.js. The parent passes the shared useWeather() result so the density box and this
// card read the same temperature.
export function WeatherWidget({ weather }: { weather: ReturnType<typeof useWeather> }) {
  const { current, metar, sunrise, sunset } = weather
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const [icon, label] = (current && WEATHER_CODES[current.weather_code]) || ['🌡️', '--']
  const alt = metar ? altitudes(metar) : null
  const cat = metar?.fltCat?.toLowerCase()
  const ageMin = metar?.obsTime ? Math.round((Date.now() / 1000 - metar.obsTime) / 60) : null

  const cell = (name: string, value: string) => (
    <div key={name}>
      <span className="fd-wp-label">{name}</span>
      <span className="fd-wp-value">{value}</span>
    </div>
  )

  return (
    <div className="fd-weather" data-testid="weather-widget">
      <div className="fd-weather-top">
        <div className="fd-weather-icon">{icon}</div>
        <span className="fd-weather-temp">{current ? `${Math.round(current.temperature_2m)}°F` : '--°F'}</span>
        {cat && <span className={`fd-flight-cat ${cat}`}>{metar?.fltCat}</span>}
        <span className="fd-weather-desc">{label}</span>
      </div>
      <div className="fd-weather-grid">
        {cell('Wind', current ? `${Math.round(current.wind_speed_10m)} mph ${windCompass(current.wind_direction_10m)}` : '--')}
        {cell('Dew Point', typeof metar?.dewp === 'number' ? `${Math.round((metar.dewp * 9) / 5 + 32)}°F` : '--')}
        {cell('Humidity', current ? `${Math.round(current.relative_humidity_2m)}%` : '--')}
        {cell('Local', clock.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}
        {cell('Ceiling', metar ? ceilingFromClouds(metar.clouds) : '--')}
        {cell('Visibility', metar?.visib ? `${metar.visib} SM` : '--')}
        {cell('Altimeter', alt ? `${alt.altimeterInHg.toFixed(2)} inHg` : '--')}
        {cell('UTC', `${clock.toUTCString().slice(17, 22)} UTC`)}
        {cell('Pressure Alt', alt ? `${Math.round(alt.pressureAltFt).toLocaleString()} ft` : '--')}
        {cell('Density Alt', alt?.densityAltFt != null ? `${Math.round(alt.densityAltFt).toLocaleString()} ft` : '--')}
        {cell('Sunrise', sunrise ? formatIsoTimeOfDay(sunrise) : '--')}
        {cell('Sunset', sunset ? formatIsoTimeOfDay(sunset) : '--')}
      </div>
      <div className="fd-metar-raw">{metar?.rawOb ? `${metar.rawOb}${ageMin != null ? ` (${ageMin} min ago)` : ''}` : 'METAR data unavailable'}</div>
      <a className="fd-weather-link" href="https://metar-taf.com/KMSO" target="_blank" rel="noopener noreferrer">
        Full METAR/TAF on metar-taf.com ↗
      </a>
    </div>
  )
}
