'use client'

import { type CurrentWeather, type Metar, WEATHER_URL } from '@/lib/weather'
import { useEffect, useState } from 'react'

const POLL_MS = 10 * 60 * 1000 // weather and METAR both refresh every 10 minutes

interface Weather {
  current: CurrentWeather | null
  sunrise: string | null
  sunset: string | null
  metar: Metar | null
}

/** Outside conditions and KMSO METAR, shared by the Fuel Dispatch header card and the density box. */
export function useWeather(): Weather {
  const [state, setState] = useState<Weather>({ current: null, sunrise: null, sunset: null, metar: null })

  useEffect(() => {
    let cancelled = false
    const loadWeather = async () => {
      try {
        const data = await (await fetch(WEATHER_URL)).json()
        if (!cancelled) {
          setState((s) => ({
            ...s,
            current: data.current,
            sunrise: data.daily?.sunrise?.[0] ?? null,
            sunset: data.daily?.sunset?.[0] ?? null
          }))
        }
      } catch (error) {
        console.error('Failed to fetch outside temperature:', error)
      }
    }
    const loadMetar = async () => {
      try {
        const data = await (await fetch('/api/metar', { cache: 'no-store' })).json()
        if (!cancelled && data.success) setState((s) => ({ ...s, metar: data.metar }))
      } catch (error) {
        console.error('Failed to fetch METAR:', error)
      }
    }
    void loadWeather()
    void loadMetar()
    const timers = [setInterval(loadWeather, POLL_MS), setInterval(loadMetar, POLL_MS)]
    return () => {
      cancelled = true
      timers.forEach(clearInterval)
    }
  }, [])

  return state
}
