'use client'

import { useState } from 'react'

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

const pad = (h: number) => String(h).padStart(2, '0')

/** 24-segment heatmap of on-duty headcount for one day (midnight → midnight). Hover shows the hour and headcount. */
export function CoverageStrip({ coverage, className }: CoverageStripProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const count = hovered === null ? 0 : (coverage[hovered] ?? 0)

  return (
    <div className={cn('relative w-full py-1', className)} onMouseLeave={() => setHovered(null)}>
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full">
        {coverage.map((n, hour) => (
          <div
            key={hour}
            className={cn('min-w-0 flex-1 transition-opacity', segmentColor(n), hovered !== null && hovered !== hour && 'opacity-50')}
            onMouseEnter={() => setHovered(hour)}
          />
        ))}
      </div>
      {hovered !== null && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground shadow-md"
          style={{ left: `${((hovered + 0.5) / coverage.length) * 100}%` }}
        >
          {pad(hovered)}:00–{pad((hovered + 1) % 24)}:00 · {count} on duty
        </div>
      )}
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
