'use client'

import type { TankWithLatestReading } from '@/repositories/tanks.repo'
import { computeTankMetrics, levelPillStyle } from '@/lib/fuel-farm'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface TankCardProps {
  tank: TankWithLatestReading
  onUpdateLevel: (tankId: string, level: number) => Promise<void>
  onError: (message: string) => void
  onEdit?: (tank: TankWithLatestReading) => void
}

function parseFootInchToInches(input: string): number {
  const footInch = input.match(/^(\d+(?:\.\d+)?)'(\d+(?:\.\d+)?)"?$/)
  if (footInch) return Number.parseFloat(footInch[1]) * 12 + Number.parseFloat(footInch[2])
  const feetOnly = input.match(/^(\d+(?:\.\d+)?)'$/)
  if (feetOnly) return Number.parseFloat(feetOnly[1]) * 12
  return Number.parseFloat(input)
}

function markerPositions(usableMax: number) {
  const out: { position: number; major: boolean }[] = []
  for (let i = 0; i <= usableMax; i += 10) {
    out.push({ position: ((usableMax - i) / usableMax) * 100, major: i % 20 === 0 })
  }
  return out
}

export function TankCard({ tank, onUpdateLevel, onError, onEdit }: TankCardProps) {
  const [inputValue, setInputValue] = useState('')
  const [placeholder, setPlaceholder] = useState(true)
  const [updating, setUpdating] = useState(false)

  const id = tank.tank_id
  const usableMax = Number(tank.usable_max_inches)
  const minLevel = Number(tank.min_level_inches)
  const maxLevel = Number(tank.max_level_inches)
  const level = tank.latest_reading ? Number(tank.latest_reading.level) : 0
  const recordedLow = tank.recorded_low != null ? Number(tank.recorded_low) : null
  const m = computeTankMetrics(id, level, usableMax, recordedLow)

  const fuelClass = tank.fuel_type === 'avgas' ? 'avgas' : 'jet-a'
  const fuelLabel = tank.fuel_type === 'avgas' ? 'Avgas' : 'Jet A'

  const handleUpdate = async () => {
    const raw = inputValue.trim()
    if (raw === '') return
    const next = parseFootInchToInches(raw)
    if (Number.isNaN(next)) return onError(`Invalid input for ${id}: ${raw}`)
    if (next < minLevel) return onError(`${id} must be at least ${minLevel}"`)
    // Only the physical limit is enforced; readings above usable-max are
    // recorded as-is so an overfill shows at its real level.
    if (next > maxLevel) return onError(`${id} cannot exceed ${maxLevel}" (physical tank limit)`)

    setUpdating(true)
    try {
      await onUpdateLevel(id, next)
      setInputValue('')
    } catch {
      // surfaced by the page
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className={cn('tank-card', id === 'T7' && 't7', id === 'LF' && 'lf')} data-testid={`tank-${id}`}>
      <div className="tank-header">
        <div className="tank-name">{id}</div>
        <div className={cn('fuel-type', fuelClass)}>{fuelLabel}</div>
        {onEdit && (
          <button type="button" className="tank-edit" onClick={() => onEdit(tank)}>
            Edit tank
          </button>
        )}
      </div>

      <div className="tank-visual-wrap">
        <div className="tank-visual">
          <div
            className={cn('fuel-level', fuelClass, m.isOverMax && 'over-max')}
            style={{ height: `${m.fillPercent}%` }}
          />
          {m.hasRecordedLow && (
            <div className="unusable-zone" style={{ height: `${m.unusableZonePercent}%` }} />
          )}
          <div className="level-markers">
            {markerPositions(usableMax).map((mk) => (
              <div
                key={mk.position}
                className={cn('marker', mk.major && 'major')}
                style={{ top: `${mk.position}%` }}
              />
            ))}
          </div>
        </div>
        {m.hasRecordedLow && (
          <div className="unusable-tooltip">
            <div className="unusable-tooltip-row">
              <span>Unusable</span>
              <strong>{m.unusableGallons.toLocaleString()} gal</strong>
            </div>
            <div className="unusable-tooltip-row">
              <span>Lowest ever</span>
              <strong>{m.recordedLow}&quot;</strong>
            </div>
          </div>
        )}
      </div>

      <div className="level-info">
        <div className="current-level">{level}&quot;</div>
        <div className="level-gallons">{m.gallons.toLocaleString()} gal</div>
        {m.hasRecordedLow && (
          <div className="level-usable">{m.usableGallons.toLocaleString()} gal usable</div>
        )}
        <div
          className="level-percentage"
          style={m.isOverMax ? { background: '#dc3545', color: '#ffffff' } : levelPillStyle(level, usableMax)}
        >
          {m.isOverMax ? `⚠️ ${m.percentage}% — over ${usableMax}" line` : `${m.percentage}% full`}
        </div>
        <div className={cn('level-ullage', m.isOverMax && 'over-max')}>
          {m.isOverMax
            ? `${Math.abs(m.ullageGallons).toLocaleString()} gal over the line`
            : `Ullage: ${m.ullageGallons.toLocaleString()} gal to ${usableMax}"`}
        </div>
      </div>

      <div className="update-section">
        <div className="input-group">
          <input
            type="text"
            inputMode="decimal"
            className="level-input"
            data-testid={`level-input-${id}`}
            placeholder={placeholder ? 'Level (inches)' : ''}
            value={inputValue}
            disabled={updating}
            onChange={(e) => setInputValue(e.target.value.replace(/[^0-9.'"\s]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleUpdate()
              }
            }}
            onFocus={() => setPlaceholder(false)}
            onBlur={() => setPlaceholder(true)}
          />
          <button
            type="button"
            className="update-btn"
            data-testid={`level-update-${id}`}
            disabled={updating}
            onClick={handleUpdate}
          >
            {updating ? 'Updating...' : 'Update'}
          </button>
        </div>
        <div className="last-updated">
          Updated: {tank.latest_reading ? new Date(tank.latest_reading.recorded_at).toLocaleString() : 'never'}
        </div>
      </div>
    </div>
  )
}
