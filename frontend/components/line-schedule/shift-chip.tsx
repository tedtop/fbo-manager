'use client'

import { Moon, Sun, Sunrise, Sunset } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatShiftRange,
  formatShiftTime,
  isOvernight,
  shiftCategory,
  shiftDurationHours,
  type ShiftCategory,
} from '@/services/schedule.service'

const CATEGORY_STYLES: Record<ShiftCategory, string> = {
  morning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
  day: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20',
  swing: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20',
  night: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20',
}

const CATEGORY_ICONS: Record<ShiftCategory, typeof Sun> = {
  morning: Sunrise,
  day: Sun,
  swing: Sunset,
  night: Moon,
}

interface ShiftChipProps {
  startTime: string
  endTime: string
  onClick?: () => void
  /** Ghost rendering for the morning tail of the previous day's overnight shift */
  continuation?: boolean
  /** Dense variant for month-view cells; prefix appears before the time */
  compact?: boolean
  prefix?: string
  className?: string
}

export function ShiftChip({
  startTime,
  endTime,
  onClick,
  continuation = false,
  compact = false,
  prefix,
  className,
}: ShiftChipProps) {
  const category = shiftCategory(startTime)
  const Icon = CATEGORY_ICONS[category]
  const overnight = isOvernight(startTime, endTime)
  const hours = shiftDurationHours(startTime, endTime)
  const hoursLabel = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`

  if (continuation) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        disabled={!onClick}
        className={cn(
          'flex w-full items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px] opacity-60 transition-colors',
          CATEGORY_STYLES[category],
          !onClick && 'cursor-default',
          className
        )}
        title={`Overnight shift ${formatShiftRange(startTime, endTime)} started the previous day`}
      >
        <Moon className="h-3 w-3 shrink-0" />
        <span className="truncate">→ {formatShiftTime(endTime)}</span>
      </button>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        disabled={!onClick}
        className={cn(
          'flex w-full items-center gap-1 rounded border px-1 py-px text-[10px] font-medium leading-4 transition-colors',
          CATEGORY_STYLES[category],
          !onClick && 'cursor-default',
          className
        )}
        title={`${formatShiftRange(startTime, endTime)} · ${hoursLabel}${overnight ? ' · overnight' : ''}`}
      >
        {prefix && <span className="shrink-0 font-semibold">{prefix}</span>}
        <span className="truncate tabular-nums">
          {formatShiftTime(startTime)}
          {overnight && <Moon className="ml-0.5 inline h-2.5 w-2.5" />}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      disabled={!onClick}
      className={cn(
        'group/chip flex w-full flex-col gap-0.5 rounded-md border px-1.5 py-1 text-left transition-colors',
        CATEGORY_STYLES[category],
        !onClick && 'cursor-default',
        className
      )}
      title={`${formatShiftRange(startTime, endTime)} · ${hoursLabel}${overnight ? ' · overnight' : ''}`}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums leading-none">
        <Icon className="h-3 w-3 shrink-0" />
        {formatShiftRange(startTime, endTime)}
      </span>
      <span className="pl-4 text-[10px] leading-none opacity-70">
        {hoursLabel}
        {overnight && ' · into next day'}
      </span>
    </button>
  )
}
