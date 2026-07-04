'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useJetAHistory } from '@/hooks/use-jet-a-history'
import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '120D', days: 120 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 }
]

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function fmtDateWithYear(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function JetATrend() {
  const [days, setDays] = useState(30)
  const { data, loading } = useJetAHistory(days)

  const current = data.length > 0 ? data[data.length - 1].gallons : null
  const min = data.length > 0 ? Math.min(...data.map((d) => d.gallons)) : null
  const max = data.length > 0 ? Math.max(...data.map((d) => d.gallons)) : null

  // ~7 ticks regardless of data density
  const tickInterval = Math.max(0, Math.floor(data.length / 7) - 1)

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Jet A Trend (T2–T7)
          </h2>
          {current !== null && (
            <div className="text-2xl font-bold text-cyan-400 mt-0.5">
              {current.toLocaleString()} gal
            </div>
          )}
          {min !== null && max !== null && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Low {min.toLocaleString()} gal · High {max.toLocaleString()} gal
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {RANGES.map((r) => (
            <Button
              key={r.label}
              variant={days === r.days ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">
          No historical data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={144}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="jetAFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              interval={tickInterval}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.45)' }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip
              labelFormatter={fmtDateWithYear}
              contentStyle={{
                backgroundColor: 'hsl(260 30% 12%)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12
              }}
              labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}
              itemStyle={{ color: '#22d3ee' }}
              formatter={(value: number) => [
                `${value.toLocaleString()} gal`,
                'Total Jet A'
              ]}
            />
            <Area
              type="monotone"
              dataKey="gallons"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#jetAFill)"
              dot={false}
              activeDot={{ r: 4, fill: '#22d3ee', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
