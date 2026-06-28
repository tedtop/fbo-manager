'use client'

import type { TankWithLatestReading } from '@/repositories/tanks.repo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { inchesToGallons } from '@/lib/gallons-tables'
import { useState } from 'react'

interface TankVisualCardProps {
  tank: TankWithLatestReading
  onUpdateLevel: (tankId: string, level: number) => Promise<void>
  onFocusInput?: () => void
  onBlurInput?: () => void
}

function useTankCardState(tank: TankWithLatestReading, onUpdateLevel: TankVisualCardProps['onUpdateLevel']) {
  const [inputValue, setInputValue] = useState('')
  const [updating, setUpdating] = useState(false)
  const [showPlaceholder, setShowPlaceholder] = useState(true)

  const currentLevel = tank.latest_reading ? Number.parseFloat(tank.latest_reading.level) : 0
  const maxLevel = Number.parseFloat(tank.usable_max_inches)
  const minLevel = Number.parseFloat(tank.usable_min_inches)
  const percentage = Math.round((currentLevel / maxLevel) * 100)
  const levelHeight = (currentLevel / maxLevel) * 100
  const currentGallons = inchesToGallons(tank.tank_id, currentLevel)

  const isAvgas = tank.fuel_type === 'avgas'
  const isT7 = tank.tank_id === 'T7'
  const isLF = tank.tank_id === 'LF'

  const parseFootInchToInches = (input: string): number => {
    const footInchMatch = input.match(/^(\d+(?:\.\d+)?)'(\d+(?:\.\d+)?)"?$/)
    if (footInchMatch) {
      return Number.parseFloat(footInchMatch[1]) * 12 + Number.parseFloat(footInchMatch[2])
    }
    const feetOnlyMatch = input.match(/^(\d+(?:\.\d+)?)'$/)
    if (feetOnlyMatch) {
      return Number.parseFloat(feetOnlyMatch[1]) * 12
    }
    return Number.parseFloat(input)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, decimal point, apostrophe, double quote (foot-inch notation)
    const cleaned = e.target.value.replace(/[^0-9.'"]/g, '')
    setInputValue(cleaned)
  }

  const handleUpdate = async () => {
    if (!inputValue.trim()) return

    let level = parseFootInchToInches(inputValue.trim())
    if (isNaN(level)) return

    if (level < minLevel) {
      alert(`${tank.tank_id} must be at least ${minLevel}"`)
      return
    }
    // Floor to max instead of rejecting
    if (level > maxLevel) level = maxLevel

    setUpdating(true)
    try {
      await onUpdateLevel(tank.tank_id, level)
      setInputValue('')
    } catch (error) {
      console.error('Failed to update tank level:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUpdate()
  }

  const formatLastUpdated = (isoString?: string) => {
    if (!isoString) return 'Never'
    return new Date(isoString).toLocaleString()
  }

  return {
    inputValue, setInputValue, updating, showPlaceholder, setShowPlaceholder,
    currentLevel, maxLevel, minLevel, percentage, levelHeight, currentGallons,
    isAvgas, isT7, isLF,
    handleInputChange, handleUpdate, handleKeyPress, formatLastUpdated,
  }
}

export function TankVisualCard({ tank, onUpdateLevel, onFocusInput, onBlurInput }: TankVisualCardProps) {
  const s = useTankCardState(tank, onUpdateLevel)

  return (
    <Card
      className={cn(
        'bg-card hover:shadow-lg transition-all',
        s.isT7 && 'border-2 border-warning/40 bg-warning/5',
        s.isLF && 'border-2 border-primary/40 bg-primary/5'
      )}
    >
      <div className="p-4 text-center space-y-4">
        {/* Header */}
        <div>
          <div className="text-2xl font-bold text-foreground">{tank.tank_id}</div>
          <Badge
            className={cn(
              'mt-1 text-xs',
              s.isAvgas
                ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                : 'bg-cyan-100 text-cyan-800 border-cyan-300'
            )}
          >
            {s.isAvgas ? 'Avgas' : 'Jet A'}
          </Badge>
        </div>

        {/* Visual Tank */}
        <div className="relative w-20 h-48 mx-auto bg-muted border-2 border-border rounded-lg overflow-hidden">
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 transition-all duration-700 rounded-b-lg',
              s.isAvgas
                ? 'bg-gradient-to-t from-orange-500 to-yellow-400 shadow-[0_-2px_10px_rgba(255,193,7,0.3)]'
                : 'bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-[0_-2px_10px_rgba(23,162,184,0.3)]'
            )}
            style={{ height: `${Math.min(s.levelHeight, 100)}%` }}
          />
          <div className="absolute left-0 top-0 h-full w-full pointer-events-none">
            {[...Array(9)].map((_, i) => {
              const isMajor = i % 2 === 0
              return (
                <div
                  key={i}
                  className={cn('absolute left-0 bg-muted-foreground/50', isMajor ? 'w-3 h-0.5' : 'w-2 h-px')}
                  style={{ top: `${i * 12.5}%` }}
                />
              )
            })}
          </div>
        </div>

        {/* Level Info */}
        <div>
          <div className="text-3xl font-bold text-foreground">{s.currentLevel.toFixed(1)}"</div>
          <div className="text-sm text-muted-foreground">{s.percentage}% ({s.maxLevel}" max)</div>
          <div className="text-sm text-muted-foreground">{s.currentGallons.toLocaleString()} gal</div>
        </div>

        {/* Update Section */}
        <div className="space-y-2 pt-3 border-t border-border">
          <Input
            type="text"
            inputMode="decimal"
            placeholder={s.showPlaceholder ? 'Level (inches)' : ''}
            value={s.inputValue}
            onChange={s.handleInputChange}
            onKeyPress={s.handleKeyPress}
            onFocus={() => { s.setShowPlaceholder(false); onFocusInput?.() }}
            onBlur={() => { s.setShowPlaceholder(true); onBlurInput?.() }}
            className="text-center text-sm"
            disabled={s.updating}
          />
          <Button
            onClick={s.handleUpdate}
            disabled={s.updating || !s.inputValue.trim()}
            className="w-full"
          >
            {s.updating ? 'Updating...' : 'Update'}
          </Button>
          <div className="text-xs text-muted-foreground">
            Updated: {s.formatLastUpdated(tank.latest_reading?.recorded_at)}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function HorizontalTankCard({ tank, onUpdateLevel, onFocusInput, onBlurInput }: TankVisualCardProps) {
  const s = useTankCardState(tank, onUpdateLevel)

  return (
    <Card
      className={cn(
        'bg-card hover:shadow-lg transition-all',
        s.isT7 && 'border-2 border-warning/40 bg-warning/5',
        s.isLF && 'border-2 border-primary/40 bg-primary/5'
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-foreground">{tank.tank_id}</div>
            <Badge
              className={cn(
                'text-xs',
                s.isAvgas
                  ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                  : 'bg-cyan-100 text-cyan-800 border-cyan-300'
              )}
            >
              {s.isAvgas ? 'Avgas' : s.isLF ? 'Jet A (Life Flight)' : 'Jet A'}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{s.currentLevel.toFixed(1)}"</div>
            <div className="text-xs text-muted-foreground">{s.percentage}% ({s.maxLevel}" max)</div>
            <div className="text-xs text-muted-foreground">{s.currentGallons.toLocaleString()} gal</div>
          </div>
        </div>

        {/* Horizontal cylinder visual — wide pill, fills left to right */}
        <div className="relative h-10 bg-muted border-2 border-border rounded-full overflow-hidden">
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 transition-all duration-700',
              s.isAvgas
                ? 'bg-gradient-to-r from-orange-500 to-yellow-400 shadow-[2px_0_10px_rgba(255,193,7,0.3)]'
                : 'bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[2px_0_10px_rgba(23,162,184,0.3)]'
            )}
            style={{
              width: `${Math.min(s.levelHeight, 100)}%`,
              borderRadius: s.levelHeight >= 98 ? '9999px' : '9999px 0 0 9999px',
            }}
          />
          {/* Quarter-mark tick lines */}
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute top-1 bottom-1 w-px bg-muted-foreground/30"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>

        {/* Update section */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input
            type="text"
            inputMode="decimal"
            placeholder={s.showPlaceholder ? 'Level (inches)' : ''}
            value={s.inputValue}
            onChange={s.handleInputChange}
            onKeyPress={s.handleKeyPress}
            onFocus={() => { s.setShowPlaceholder(false); onFocusInput?.() }}
            onBlur={() => { s.setShowPlaceholder(true); onBlurInput?.() }}
            className="text-sm w-36"
            disabled={s.updating}
          />
          <Button
            onClick={s.handleUpdate}
            disabled={s.updating || !s.inputValue.trim()}
            size="sm"
          >
            {s.updating ? 'Updating...' : 'Update'}
          </Button>
          <div className="text-xs text-muted-foreground ml-auto">
            Updated: {s.formatLastUpdated(tank.latest_reading?.recorded_at)}
          </div>
        </div>
      </div>
    </Card>
  )
}
