'use client'

import { useGravity } from '@/hooks/use-gravity'
import type { GravitySaveResult } from '@/repositories/gravity.repo'
import { useState } from 'react'

interface GravityPanelProps {
  farmCapacityGallons: number
  onError: (message: string) => void
}

const EMPTY = { temp: '', api: '', wheel: '', driver: '', sg: '', gallons: '' }

export function GravityPanel({ farmCapacityGallons, onError }: GravityPanelProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [result, setResult] = useState<GravitySaveResult | null>(null)
  const { average, save, saving } = useGravity(farmCapacityGallons)

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    const observedTempF = Number.parseFloat(form.temp)
    const observedApiGravity = Number.parseFloat(form.api)
    const wheelApiGravity60 = Number.parseFloat(form.wheel)
    const driverApiGravity = Number.parseFloat(form.driver)
    const gallonsDelivered = Number.parseFloat(form.gallons)
    const driverSpecificGravity = form.sg.trim() === '' ? null : Number.parseFloat(form.sg)

    if ([observedTempF, observedApiGravity, wheelApiGravity60, driverApiGravity, gallonsDelivered].some(Number.isNaN)) {
      return onError('Fill in temp, hydrometer reading, wheel reading, driver gravity, and gallons delivered')
    }
    if (driverSpecificGravity !== null && Number.isNaN(driverSpecificGravity)) {
      return onError("Driver's specific gravity must be a number")
    }
    if (gallonsDelivered <= 0) return onError('Gallons delivered must be greater than 0')

    try {
      setResult(
        await save({
          observedTempF,
          observedApiGravity,
          wheelApiGravity60,
          driverApiGravity,
          driverSpecificGravity,
          gallonsDelivered
        })
      )
      setForm(EMPTY)
    } catch (err) {
      console.error('Failed to save fuel gravity reading:', err)
      onError('Failed to save fuel gravity reading')
    }
  }

  const field = (key: keyof typeof EMPTY, label: React.ReactNode, step: string, placeholder?: string) => (
    <div className="ff-gravity-row">
      <label htmlFor={`gravity-${key}`}>{label}</label>
      <input
        id={`gravity-${key}`}
        type="number"
        step={step}
        placeholder={placeholder}
        value={form[key]}
        onChange={set(key)}
      />
    </div>
  )

  return (
    <div className="ff">
      <button
        type="button"
        className="ff-gravity-icon"
        title="Fuel load gravity QC"
        onClick={() => {
          setOpen((o) => !o)
          setResult(null)
        }}
      >
        🧪
      </button>
      {open && (
        <div className="ff-gravity-panel">
          <div className="ff-gravity-current">
            {average ? (
              <>
                <div className="ff-gravity-item">
                  <div className="ff-gravity-label">Mixed API Gravity</div>
                  <div className="ff-gravity-value">{average.apiGravity60.toFixed(2)}°</div>
                </div>
                <div className="ff-gravity-item">
                  <div className="ff-gravity-label">Mixed Sp. Gravity</div>
                  <div className="ff-gravity-value">{average.specificGravity60.toFixed(4)}</div>
                </div>
                <div className="ff-gravity-item">
                  <div className="ff-gravity-label">Density @ 60°F</div>
                  <div className="ff-gravity-value">{average.densityLbsGal60.toFixed(3)} lbs/gal</div>
                </div>
                <div className="ff-gravity-item">
                  <div className="ff-gravity-label">Loads in Window</div>
                  <div className="ff-gravity-value">
                    {average.sampleCount} ({Math.round(average.totalGallons).toLocaleString()} gal)
                  </div>
                </div>
              </>
            ) : (
              <div className="ff-gravity-empty">No loads logged yet</div>
            )}
          </div>

          <h4>Fuel Load Gravity QC</h4>
          <p>
            Jet A loads into T2–T7. Hydrometer reading + temp, then the GTP‑3012‑1A wheel&apos;s 60°F correction —
            that wheel reading is checked against the driver&apos;s BOL and must be within ±1.0 API to be acceptable.
          </p>

          {field('temp', 'Observed Fuel Temp (°F)', '1')}
          {field('api', 'Hydrometer Reading (°API)', '0.1')}
          {field('wheel', 'Wheel Reading @ 60°F (°API)', '0.1')}
          {field('driver', "Driver's BOL API Gravity", '0.1')}
          {field('sg', "Driver's BOL Specific Gravity", '0.0001', 'optional')}
          {field('gallons', 'Gallons Delivered', '1', '~12000')}

          <button type="button" className="ff-gravity-save" disabled={saving} onClick={handleSave}>
            {saving ? (
              <>
                <span className="spinner" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>

          {result && (
            <div className={`ff-gravity-result ${result.acceptable ? 'acceptable' : 'rejected'}`}>
              {result.acceptable
                ? `✅ Acceptable — Δ ${result.deltaApi.toFixed(2)}° API vs. driver`
                : `❌ Reject — Δ ${result.deltaApi.toFixed(2)}° API exceeds ±1.0`}
              {result.formulaMismatch && (
                <span className="note">
                  ⚠️ Computed cross-check ({result.computedApiGravity60}°) differs from the wheel reading by more
                  than 0.3° — double-check the wheel reading.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
