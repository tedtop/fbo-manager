'use client'

import { cn } from '@/lib/utils'

function segmentColor(count: number): string {
  if (count === 0) return 'bg-muted'
  if (count === 1) return 'bg-red-500/70'
  if (count === 2) return 'bg-amber-500/70'
  return 'bg-emerald-500/70'
}

interface CoverageStripProps {
  /** Headcount for each hour 0-23 */
  coverage: number[]
  className?: string
}

/** 24-segment heatmap of on-duty headcount for one day (midnight → midnight). */
export function CoverageStrip({ coverage, className }: CoverageStripProps) {
  return (
    <div className={cn('flex h-1.5 w-full gap-px overflow-hidden rounded-full', className)}>
      {coverage.map((count, hour) => (
        <div
          key={hour}
          className={cn('min-w-0 flex-1', segmentColor(count))}
          title={`${String(hour).padStart(2, '0')}:00 — ${count} on duty`}
        />
      ))}
    </div>
  )
}

export function CoverageLegend({ className }: { className?: string }) {
  const items = [
    { label: 'none', color: 'bg-muted' },
    { label: '1 on duty', color: 'bg-red-500/70' },
    { label: '2 on duty', color: 'bg-amber-500/70' },
    { label: '3+', color: 'bg-emerald-500/70' },
  ]
  return (
    <span className={cn('flex items-center gap-3 text-[11px] text-muted-foreground', className)}>
      <span className="font-medium">Coverage:</span>
      {items.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={cn('inline-block h-2 w-4 rounded-sm', color)} />
          {label}
        </span>
      ))}
    </span>
  )
}
