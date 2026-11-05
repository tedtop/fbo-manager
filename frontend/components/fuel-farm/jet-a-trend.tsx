'use client'

import { useJetAHistory } from '@/hooks/use-jet-a-history'
import {
  type FarmTank,
  jetATotalGallons,
  jetATotalUllage,
  jetATotalUsable
} from '@/lib/fuel-farm'
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

const WIDTH = 400
const HEIGHT = 150
const PAD = 4

interface Point {
  time: number
  total: number
}

interface JetATrendProps {
  tanks: FarmTank[]
}

export function JetATrend({ tanks }: JetATrendProps) {
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

  const low = points.length ? Math.round(scale.minTotal).toLocaleString() : ''
  const high = points.length ? Math.round(scale.maxTotal).toLocaleString() : ''

  return (
    <div className="trend-widget" data-testid="jet-a-trend">
      <div className="trend-header">
        <span className="trend-title">Jet A Trend (T2-T7)</span>
        <span className="trend-total">{Math.round(currentTotal).toLocaleString()} gal</span>
      </div>
      <div className="trend-minmax">{hasHistory ? `Low ${low} gal · High ${high} gal` : ''}</div>
      <div className="trend-pills">
        <span className="trend-usable">Usable: {totalUsable.toLocaleString()} gal</span>
        <span className="trend-ullage">Ullage: {totalUllage.toLocaleString()} gal available</span>
      </div>

      {hasHistory && (
        <div className="trend-chart-wrap" onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
          <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            <polyline className="trend-area" points={areaPoints} />
            <polyline className="trend-line" points={linePoints} />
            {hover && (
              <>
                <line className="trend-hover-line" x1={x(hover.time)} x2={x(hover.time)} y1={0} y2={HEIGHT} />
                <circle className="trend-hover-dot" r={3} cx={x(hover.time)} cy={y(hover.total)} />
              </>
            )}
          </svg>
          {hover && (
            <div className="trend-tooltip" style={{ left: `${(x(hover.time) / WIDTH) * 100}%` }}>
              {new Date(hover.time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
              : {Math.round(hover.total).toLocaleString()} gal
            </div>
          )}
          {loading && (
            <div className="trend-loading">
              <div className="trend-spinner" />
            </div>
          )}
        </div>
      )}
      {!hasHistory && !loading && <div className="trend-empty">No history yet</div>}
      {!hasHistory && loading && (
        <div className="trend-chart-wrap" style={{ height: 140 }}>
          <div className="trend-loading">
            <div className="trend-spinner" />
          </div>
        </div>
      )}

      <div className="trend-zoom">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`trend-zoom-btn${days === r.days ? ' active' : ''}`}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
