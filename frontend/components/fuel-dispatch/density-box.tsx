'use client'

import { useGravity } from '@/hooks/use-gravity'
import { useTanks } from '@/hooks/use-tanks'
import type { CurrentWeather } from '@/lib/weather'
import { JET_A_TREND_TANKS } from '@/lib/fuel-farm'
import { densityLbsGalAtTemp } from '@/lib/gravity-correction'
import { createClient } from '@/lib/supabase/client'
import {
  DEFAULT_DENSITY_READING,
  type FuelDensityReading,
  getLatestDensityReading,
  saveDensityReading
} from '@/repositories/fuel-density.repo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

// Manual fallback slope: lbs/gal per degree F (+-0.01 per 10 F), used only without farm QC loads.
const SLOPE_PER_DEGREE = -0.001
const bracket = (temp: number) => Math.round(temp / 10) * 10
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Outside temp and estimated fuel density, plus the floating button and panel to enter a hydrometer
 * reading, ported from Minuteman's fuel dispatch page. Prefers the fuel farm's gravity-QC rolling
 * average (gallon-weighted, corrected to the outside temperature bracket); the manual reading is the
 * fallback while no QC loads are logged.
 */
export function DensityBox({ weather, onError }: { weather: CurrentWeather | null; onError: (message: string) => void }) {
  const db = createClient()
  const qc = useQueryClient()
  const { tanks } = useTanks()
  const farmCapacity = (tanks ?? [])
    .filter((t) => JET_A_TREND_TANKS.includes(t.tank_id))
    .reduce((sum, t) => sum + Number(t.capacity_gallons), 0)
  const { average } = useGravity(farmCapacity)
  const { data: stored } = useQuery({
    queryKey: ['fuel-density-reading'],
    queryFn: () => getLatestDensityReading(db)
  })
  const reading: FuelDensityReading = stored ?? DEFAULT_DENSITY_READING

  const temp = weather?.temperature_2m ?? null
  let densityText = '-- lbs/gal'
  let sourceText = ''
  if (temp !== null) {
    const b = bracket(temp)
    let density: number
    if (average) {
      density = densityLbsGalAtTemp(average.apiGravity60, b)
      sourceText = `farm avg · ${average.sampleCount} load${average.sampleCount === 1 ? '' : 's'} in window`
    } else {
      density = round2(reading.densityLbsGal + (b - reading.temperatureF) * SLOPE_PER_DEGREE)
      sourceText = 'manual reading (no farm QC loads logged yet)'
    }
    densityText = `${density.toFixed(2)} lbs/gal`
  }
  const tempText = temp !== null ? `${Math.round(temp)}°F` : '--°F'

  const [open, setOpen] = useState(false)
  const [formTemp, setFormTemp] = useState('')
  const [formDensity, setFormDensity] = useState('')
  const [saving, setSaving] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const toggle = () => {
    if (!open) {
      setFormTemp(String(reading.temperatureF))
      setFormDensity(reading.densityLbsGal.toFixed(2))
    }
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const save = async () => {
    const temperatureF = Number.parseFloat(formTemp)
    const densityLbsGal = Number.parseFloat(formDensity)
    if (Number.isNaN(temperatureF) || Number.isNaN(densityLbsGal) || densityLbsGal <= 0) return
    setSaving(true)
    try {
      await saveDensityReading(db, { temperatureF, densityLbsGal: round2(densityLbsGal) })
      await qc.invalidateQueries({ queryKey: ['fuel-density-reading'] })
      setOpen(false)
    } catch (error) {
      console.error('Failed to save fuel density reading:', error)
      onError('Failed to save fuel density reading')
    } finally {
      setSaving(false)
    }
  }

  const current = (
    <>
      <div className="fd-density-item">
        <div className="fd-density-label">🌡️ Outside Temp</div>
        <div className="fd-density-value">{tempText}</div>
      </div>
      <div className="fd-density-item">
        <div className="fd-density-label">Est. Fuel Density</div>
        <div className="fd-density-value">{densityText}</div>
        <div className="fd-density-source">{sourceText}</div>
      </div>
    </>
  )

  return (
    <>
      <div className="fd-box fd-density-box" data-testid="density-box">
        {current}
      </div>

      <button ref={buttonRef} type="button" className="fd-fab density" onClick={toggle} aria-label="Fuel density reading">
        🌡️
      </button>
      {open && (
        <div ref={panelRef} className="fd-panel" data-testid="density-panel">
          <div className="fd-density-current">{current}</div>
          <h4>Fuel Density Reading</h4>
          <p>
            Used only as a fallback when the fuel farm hasn&apos;t logged any gravity QC loads yet (see the Log a load
            button on the Fuel Farm page) &mdash; otherwise the estimate above comes from that farm-wide average.
            Estimates for other temperatures here are extrapolated at &plusmn;0.01 lbs/gal per 10&deg;F.
          </p>
          <div className="fd-density-row">
            <label htmlFor="densityReadingTemp">Fuel Temp (&deg;F)</label>
            <input id="densityReadingTemp" type="number" step="1" value={formTemp} onChange={(e) => setFormTemp(e.target.value)} />
          </div>
          <div className="fd-density-row">
            <label htmlFor="densityReadingValue">Density (lbs/gal)</label>
            <input
              id="densityReadingValue"
              type="number"
              step="0.01"
              min="0"
              max="9.99"
              value={formDensity}
              onChange={(e) => setFormDensity(e.target.value)}
            />
          </div>
          <button type="button" className="fd-save" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </>
  )
}
