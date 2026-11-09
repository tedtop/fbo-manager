'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { computeTankMetrics, levelPillStyle } from '@/lib/fuel-farm'
import { cn } from '@/lib/utils'
import type { TankWithLatestReading } from '@/repositories/tanks.repo'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

interface TankCardProps {
  tank: TankWithLatestReading
  /** T7 and Life Flight sit outside the containment area. */
  outside?: boolean
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

/** A tick every 10", major every 20", measured up from the bottom of the usable range. */
function markerPositions(usableMax: number) {
  const out: { position: number; major: boolean }[] = []
  for (let i = 0; i <= usableMax; i += 10) {
    out.push({ position: ((usableMax - i) / usableMax) * 100, major: i % 20 === 0 })
  }
  return out
}

function formatUpdated(iso: string | undefined) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function TankCard({ tank, outside, onUpdateLevel, onError, onEdit }: TankCardProps) {
  const [inputValue, setInputValue] = useState('')
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
    // Empty Update fills in the current reading to adjust from (Minuteman behaviour)
    if (raw === '') return setInputValue(String(level))
    const next = parseFootInchToInches(raw)
    if (Number.isNaN(next)) return onError(`Invalid reading for ${id}: ${raw}`)
    if (next < minLevel) return onError(`${id} must be at least ${minLevel}"`)
    // Only the physical limit is enforced; readings above usable-max are
    // recorded as-is so an overfill shows at its real level.
    if (next > maxLevel) return onError(`${id} cannot exceed ${maxLevel}" (physical tank limit)`)

    setUpdating(true)
    try {
      await onUpdateLevel(id, next)
      setInputValue('')
    } catch {
      // the page toasts the failure
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div
      className={cn(
        'ff-card rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md',
        outside && 'outside'
      )}
      data-testid={`tank-${id}`}
    >
      <div className="relative">
        <div className="tank-name">{id}</div>
        <div className={cn('fuel-type mt-1', fuelClass)}>{fuelLabel}</div>
        {onEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute -right-2 -top-2 h-7 w-7 text-muted-foreground hover:text-foreground"
            title={`Edit ${tank.tank_name}`}
            aria-label={`Edit ${tank.tank_name}`}
            onClick={() => onEdit(tank)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="tank-visual-wrap">
        <div className="tank-visual">
          <div
            className={cn('fuel-level', fuelClass, m.isOverMax && 'over-max')}
            style={{ height: `${m.fillPercent}%` }}
          />
          {m.hasRecordedLow && (
            <div className={cn('unusable-zone', fuelClass)} style={{ height: `${m.unusableZonePercent}%` }} />
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

      <div>
        <div className="current-level">{level}&quot;</div>
        <div className="level-gallons">{m.gallons.toLocaleString()} gal</div>
        {m.hasRecordedLow && (
          <div className="level-usable">{m.usableGallons.toLocaleString()} gal usable</div>
        )}
        <div className="level-pills">
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
      </div>

      {/* pushes the update controls to the card bottom so they line up across tanks */}
      <div className="min-h-4 flex-1" />
      <div className="space-y-2 border-t border-border pt-3">
        <Input
          type="text"
          inputMode="decimal"
          className="h-9 text-center text-sm"
          data-testid={`level-input-${id}`}
          placeholder={`Reading (in or 5'7")`}
          aria-label={`New ${id} reading`}
          value={inputValue}
          disabled={updating}
          onChange={(e) => setInputValue(e.target.value.replace(/[^0-9.'"\s]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleUpdate()
            }
          }}
        />
        <Button
          type="button"
          className="h-9 w-full"
          data-testid={`level-update-${id}`}
          disabled={updating}
          onClick={handleUpdate}
        >
          {updating ? 'Updating...' : 'Update'}
        </Button>
        <div className="text-xs text-muted-foreground">Updated {formatUpdated(tank.latest_reading?.recorded_at)}</div>
      </div>
    </div>
  )
}
