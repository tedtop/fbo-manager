'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Plus, X } from 'lucide-react'
import { type ReadingPosition, parseNum, readingDelta } from './ticket-math'
import { type PositionReadingDraft, draftKey } from './types'

const POSITIONS: Array<{ value: ReadingPosition; label: string }> = [
  { value: 'left', label: 'L' },
  { value: 'right', label: 'R' },
  { value: 'center', label: 'C' },
  { value: 'total', label: 'T' }
]

interface PositionReadingsEditorProps {
  readings: PositionReadingDraft[]
  onChange: (readings: PositionReadingDraft[]) => void
  disabled?: boolean
}

export function emptyReading(
  position: ReadingPosition = 'left'
): PositionReadingDraft {
  return { key: draftKey(), position, start: '', end: '' }
}

/**
 * The gauge lines from the ticket's DESCRIPTION block, entered the way
 * they're written: {start}-{position}-{end}. Delta computes live per line.
 */
export function PositionReadingsEditor({
  readings,
  onChange,
  disabled
}: PositionReadingsEditorProps) {
  const update = (key: string, patch: Partial<PositionReadingDraft>) => {
    onChange(readings.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const remove = (key: string) => {
    onChange(readings.filter((r) => r.key !== key))
  }

  const addNext = () => {
    // Sensible progression: L → R → T (C for three-point aircraft)
    const used = new Set(readings.map((r) => r.position))
    const next =
      (['left', 'right', 'total', 'center'] as const).find(
        (p) => !used.has(p)
      ) ?? 'left'
    onChange([...readings, emptyReading(next)])
  }

  return (
    <div className="space-y-1.5">
      {readings.map((reading) => {
        const delta = readingDelta({
          position: reading.position,
          reading_start: parseNum(reading.start),
          reading_end: parseNum(reading.end)
        })
        return (
          <div key={reading.key} className="flex items-center gap-1.5">
            <Input
              inputMode="decimal"
              value={reading.start}
              onChange={(e) => update(reading.key, { start: e.target.value })}
              placeholder="start"
              aria-label={`${reading.position} gauge start`}
              className="h-8 w-24 font-mono text-right tabular-nums"
              disabled={disabled}
            />
            <Select
              value={reading.position}
              onValueChange={(v) =>
                update(reading.key, { position: v as ReadingPosition })
              }
              disabled={disabled}
            >
              <SelectTrigger
                aria-label="Fueling position"
                className="h-8 w-14 justify-center font-mono font-bold"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="decimal"
              value={reading.end}
              onChange={(e) => update(reading.key, { end: e.target.value })}
              placeholder="end"
              aria-label={`${reading.position} gauge end`}
              className="h-8 w-24 font-mono text-right tabular-nums"
              disabled={disabled}
            />
            <span
              className={cn(
                'w-20 text-right font-mono text-xs tabular-nums',
                delta == null
                  ? 'text-muted-foreground'
                  : delta < 0
                    ? 'text-destructive'
                    : 'text-foreground'
              )}
            >
              {delta != null ? `Δ ${delta.toFixed(0)}` : '—'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => remove(reading.key)}
              disabled={disabled}
              aria-label="Remove reading line"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={addNext}
        disabled={disabled}
      >
        <Plus className="mr-1 h-3 w-3" />
        Reading line
      </Button>
    </div>
  )
}
