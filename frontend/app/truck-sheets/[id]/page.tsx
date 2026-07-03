'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Droplets, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/use-session'
import { useTruckSheet } from '@/hooks/use-truck-sheets'
import { validateReadings } from '@/components/truck-sheets/reading-validation'
import { READING_TYPE_LABELS } from '@/components/truck-sheets/truck-sheet-review'
import { ErrorMessage } from '@/messages/error-message'

function fmt(n: number | null, digits = 1): string {
  return n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export default function TruckSheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { status } = useSession()
  const router = useRouter()
  const { data: sheet, isLoading, error } = useTruckSheet(Number(id))

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center text-sm text-muted-foreground">
        Loading truck sheet…
      </div>
    )
  }

  if (error || !sheet) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ErrorMessage>{error ? (error as Error).message : 'Truck sheet not found'}</ErrorMessage>
      </div>
    )
  }

  const isJetA = sheet.fuel_type === 'jet_a'
  const readings = sheet.readings
  const issues = validateReadings(readings)

  const dispensed = readings
    .filter((r) => r.reading_type === 'fueling')
    .reduce((sum, r) => sum + (r.gallons_pumped ?? 0), 0)
  const tankFillGal = readings
    .filter((r) => r.reading_type === 'tank_fill')
    .reduce((sum, r) => sum + (r.gallons_pumped ?? 0), 0)
  const transferOutGal = readings
    .filter((r) => r.reading_type === 'transfer_out')
    .reduce((sum, r) => sum + (r.gallons_pumped ?? 0), 0)
  const endingGallons = [...readings].reverse().find((r) => r.gallons_remaining != null)
    ?.gallons_remaining
  const warnings = [...issues.values()].flat().filter((i) => i.level === 'warn').length

  const headerFacts: [string, string][] = [
    ['Date', sheet.sheet_date],
    ['Gallons down', fmt(sheet.gallons_down, 2)],
    ['Starting gallons', fmt(sheet.starting_gallons, 2)],
    ['Front meter start', fmt(sheet.front_meter_start)],
    ['Rear meter start', fmt(sheet.rear_meter_start)],
    ['Initials', sheet.fueler_initials ?? '—'],
    ['Pages', String(sheet.page_count)],
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <Link
          href="/truck-sheets"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Fuel Truck Logs
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <Droplets className={cn('w-6 h-6', isJetA ? 'text-sky-400' : 'text-emerald-400')} />
          <h1 className="text-2xl font-bold">Truck {sheet.truck_number}</h1>
          <Badge variant={isJetA ? 'default' : 'secondary'}>{isJetA ? 'Jet A' : 'Avgas'}</Badge>
          {warnings > 0 && (
            <span className="flex items-center gap-1 text-sm text-amber-400">
              <AlertTriangle className="w-4 h-4" /> {warnings} reading{warnings === 1 ? '' : 's'} to
              double-check
            </span>
          )}
        </div>
      </div>

      {/* Header facts */}
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {headerFacts.map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              <div className="font-mono text-sm mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Day summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            [`${fmt(dispensed, 1)} gal`, 'dispensed to aircraft'],
            [`${fmt(tankFillGal, 1)} gal`, 'taken from farm tanks'],
            [`${fmt(transferOutGal, 1)} gal`, 'transferred to other trucks'],
            [`${fmt(endingGallons ?? null, 1)} gal`, 'on truck at end of sheet'],
          ] as [string, string][]
        ).map(([value, label]) => (
          <Card key={label} className="p-4 text-center">
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </Card>
        ))}
      </div>

      {/* Readings */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-xs min-w-[64rem]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-2 text-left font-medium text-muted-foreground">#</th>
              <th className="w-6 p-2" />
              <th className="p-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Customer</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Tail #</th>
              <th className="p-2 text-left font-medium text-muted-foreground">A/C</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Meter</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Start</th>
              <th className="p-2 text-right font-medium text-muted-foreground">End</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Pumped</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Remaining</th>
              {isJetA && <th className="p-2 text-left font-medium text-muted-foreground">Prist</th>}
              <th className="p-2 text-left font-medium text-muted-foreground">Req</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Tech</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Invoice</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Time</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r, idx) => (
              <tr
                key={r.id}
                className={cn(
                  'border-b border-border last:border-0',
                  r.reading_type !== 'fueling' && 'bg-muted/30',
                )}
              >
                <td className="p-2 text-muted-foreground">{r.line_number}</td>
                <td className="p-2 text-center">
                  {(() => {
                    const rowIssues = issues.get(idx)
                    if (!rowIssues || rowIssues.length === 0) return null
                    const hasWarn = rowIssues.some((i) => i.level === 'warn')
                    return (
                      <span title={rowIssues.map((i) => i.message).join('\n')}>
                        {hasWarn ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Info className="w-3.5 h-3.5 text-sky-400" />
                        )}
                      </span>
                    )
                  })()}
                </td>
                <td className="p-2">
                  <Badge variant={r.reading_type === 'fueling' ? 'outline' : 'secondary'}>
                    {READING_TYPE_LABELS[r.reading_type]}
                  </Badge>
                </td>
                <td className="p-2">{r.customer ?? ''}</td>
                <td className="p-2 font-mono font-semibold">{r.tail_number ?? ''}</td>
                <td className="p-2">{r.aircraft_type ?? ''}</td>
                <td className="p-2 capitalize">{r.meter ?? ''}</td>
                <td className="p-2 text-right font-mono">{fmt(r.meter_start)}</td>
                <td className="p-2 text-right font-mono">{fmt(r.meter_end)}</td>
                <td className="p-2 text-right font-mono">{fmt(r.gallons_pumped, 2)}</td>
                <td className="p-2 text-right font-mono">{fmt(r.gallons_remaining, 2)}</td>
                {isJetA && (
                  <td className="p-2">{r.prist == null ? '' : r.prist ? 'Yes' : 'No'}</td>
                )}
                <td className="p-2">{r.req_gals_or_lbs ?? ''}</td>
                <td className="p-2">{r.line_tech_initials ?? ''}</td>
                <td className="p-2">{r.invoice_number ?? ''}</td>
                <td className="p-2">{r.service_time ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
