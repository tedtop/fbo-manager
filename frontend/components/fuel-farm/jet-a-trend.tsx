'use client'

import { useJetAHistory } from '@/hooks/use-jet-a-history'
import {
  type FarmTank,
  jetATotalGallons,
  jetATotalUllage,
  jetATotalUsable
} from '@/lib/fuel-farm'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '120D', days: 120 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 }
]

// SVG user units; the chart stretches to its box (preserveAspectRatio="none")
const WIDTH = 1000
const HEIGHT = 200
const PAD = 4

interface Point {
  time: number
  total: number
}

interface JetATrendProps {
  tanks: FarmTank[]
  className?: string
}

export function JetATrend({ tanks, className }: JetATrendProps) {
  const [days, setDays] = useState(90)
  const [hover, setHover] = useState<Point | null>(null)
  const { history, loading } = useJetAHistory(days)

  const liveLevels = useMemo(() => {
    const out: Record<string, number> = {}
    for (const t of tanks) out[t.tankId] = t.level
    return out
  }, [tanks])

  const currentTotal = jetATotalGallons(liveLevels)
  const totalUsable = jetATotalUsable(tanks)
  const totalUllage = Math.round(jetATotalUllage(tanks))

  // Walk the baseline + readings into a running total, then append the live
  // "now" total as the final point.
  const points = useMemo<Point[]>(() => {
    if (!history) return []
    const levels = { ...history.baseline }
    const out: Point[] = []
    if (history.since !== null) {
      out.push({ time: new Date(history.since).getTime(), total: jetATotalGallons(levels) })
    }
    for (const r of history.readings) {
      levels[r.tankId] = r.level
      out.push({ time: new Date(r.recordedAt).getTime(), total: jetATotalGallons(levels) })
    }
    out.push({ time: Date.now(), total: currentTotal })
    return out
  }, [history, currentTotal])

  const hasHistory =
    !!history && (history.readings.length > 0 || Object.keys(history.baseline).length > 0)

  const scale = useMemo(() => {
    const times = points.map((p) => p.time)
    const totals = points.map((p) => p.total)
    return {
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      minTotal: Math.min(...totals),
      maxTotal: Math.max(...totals)
    }
  }, [points])

  const x = (t: number) =>
    PAD + ((t - scale.minTime) / (scale.maxTime - scale.minTime || 1)) * (WIDTH - PAD * 2)
  const y = (v: number) =>
    HEIGHT - PAD - ((v - scale.minTotal) / (scale.maxTotal - scale.minTotal || 1)) * (HEIGHT - PAD * 2)

  const linePoints = points.map((p) => `${x(p.time).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ')
  const areaPoints = `${PAD},${HEIGHT - PAD} ${linePoints} ${WIDTH - PAD},${HEIGHT - PAD}`

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH
    let nearest = points[0]
    let best = Math.abs(relX - x(nearest.time))
    for (const p of points) {
      const d = Math.abs(relX - x(p.time))
      if (d < best) {
        nearest = p
        best = d
      }
    }
    setHover(nearest)
  }

  const hoverLeft = hover ? (x(hover.time) / WIDTH) * 100 : 0
  const hoverTop = hover ? (y(hover.total) / HEIGHT) * 100 : 0

  return (
    <div
      className={cn('flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm', className)}
      data-testid="jet-a-trend"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Jet A on hand (T2–T7)
          </div>
          <div className="text-3xl font-bold tabular-nums text-foreground">
            {Math.round(currentTotal).toLocaleString()} <span className="text-lg font-semibold">gal</span>
          </div>
          <div className="mt-0.5 h-4 text-xs text-muted-foreground tabular-nums">
            {hasHistory &&
              `Low ${Math.round(scale.minTotal).toLocaleString()} gal · High ${Math.round(scale.maxTotal).toLocaleString()} gal`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            <span className="trend-usable">Usable: {totalUsable.toLocaleString()} gal</span>
            <span className="trend-ullage">Ullage: {totalUllage.toLocaleString()} gal available</span>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setDays(r.days)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  days === r.days
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="relative mt-3 min-h-36 flex-1"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {hasHistory ? (
          <svg className="trend-chart absolute inset-0" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            <title>Total Jet A in T2–T7 over the selected range</title>
            <polyline className="trend-area" points={areaPoints} />
            <polyline className="trend-line" points={linePoints} />
            {hover && (
              <line className="trend-hover-line" x1={x(hover.time)} x2={x(hover.time)} y1={0} y2={HEIGHT} />
            )}
          </svg>
        ) : (
          !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No history yet
            </div>
          )
        )}
        {hover && (
          <>
            {/* HTML dot so it stays round while the SVG stretches */}
            <div
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
              style={{ left: `${hoverLeft}%`, top: `${hoverTop}%` }}
            />
            <div
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs font-semibold text-popover-foreground shadow-md ring-1 ring-border"
              style={{ left: `${Math.min(92, Math.max(8, hoverLeft))}%` }}
            >
              {new Date(hover.time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
              : {Math.round(hover.total).toLocaleString()} gal
            </div>
          </>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-card/60">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  )
}
