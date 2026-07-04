'use client'

import { validateReadings } from '@/components/truck-sheets/reading-validation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSession } from '@/hooks/use-session'
import {
  useDeleteTruckSheet,
  useFuelTrucks,
  useTruckSheets
} from '@/hooks/use-truck-sheets'
import { cn } from '@/lib/utils'
import { ErrorMessage } from '@/messages/error-message'
import type { TruckSheetWithReadings } from '@/repositories/truck-sheets.repo'
import {
  AlertTriangle,
  ArrowUpDown,
  Droplets,
  FileText,
  Fuel,
  Plus,
  Trash2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function sheetStats(sheet: TruckSheetWithReadings) {
  const fuelings = sheet.readings.filter((r) => r.reading_type === 'fueling')
  const dispensed = fuelings.reduce(
    (sum, r) => sum + (r.gallons_pumped ?? 0),
    0
  )
  const tankFills = sheet.readings.filter(
    (r) => r.reading_type === 'tank_fill'
  ).length
  const transfers = sheet.readings.filter(
    (r) => r.reading_type === 'transfer_in' || r.reading_type === 'transfer_out'
  ).length
  const issues = validateReadings(sheet.readings)
  const warnings = [...issues.values()]
    .flat()
    .filter((i) => i.level === 'warn').length
  return {
    dispensed,
    fuelings: fuelings.length,
    tankFills,
    transfers,
    warnings
  }
}

export default function TruckSheetsPage() {
  const { status } = useSession()
  const router = useRouter()
  const { data: sheets = [], isLoading, error } = useTruckSheets()
  const { data: trucks = [] } = useFuelTrucks()
  const { mutate: deleteSheet } = useDeleteTruckSheet()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const byDate = useMemo(() => {
    const groups = new Map<string, TruckSheetWithReadings[]>()
    for (const sheet of sheets) {
      const group = groups.get(sheet.sheet_date) ?? []
      group.push(sheet)
      groups.set(sheet.sheet_date, group)
    }
    return [...groups.entries()]
  }, [sheets])

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fuel className="w-6 h-6 text-primary" />
            Fuel Truck Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nightly truck sheet meter readings, by truck and date
          </p>
        </div>
        <Button asChild>
          <Link href="/truck-sheets/new">
            <Plus className="w-4 h-4 mr-1" /> Import Truck Sheets
          </Link>
        </Button>
      </div>

      {/* Fleet overview */}
      {trucks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {trucks.map((truck) => {
            const isJetA =
              /jet/i.test(truck.equipment_name) || /jet/i.test(truck.notes)
            return (
              <Card key={truck.id} className="p-3">
                <div className="flex items-center gap-2">
                  <Droplets
                    className={cn(
                      'w-4 h-4',
                      isJetA ? 'text-sky-400' : 'text-emerald-400'
                    )}
                  />
                  <span className="font-mono font-semibold">
                    {truck.equipment_id}
                  </span>
                </div>
                <div
                  className="text-xs text-muted-foreground mt-1 truncate"
                  title={truck.equipment_name}
                >
                  {truck.equipment_name.replace(/^Fuel Truck \S+\s*/, '') ||
                    truck.equipment_name}
                </div>
                <Badge
                  variant="outline"
                  className="mt-2 text-[10px] capitalize"
                >
                  {truck.status.replace('_', ' ')}
                </Badge>
              </Card>
            )
          })}
        </div>
      )}

      {error && <ErrorMessage>{(error as Error).message}</ErrorMessage>}

      {isLoading ? (
        <div className="text-muted-foreground text-sm py-12 text-center">
          Loading truck sheets…
        </div>
      ) : sheets.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
          <div className="font-semibold">No truck sheets yet</div>
          <p className="text-sm text-muted-foreground">
            Photograph tonight&apos;s truck sheets and import them — the meter
            readings are extracted automatically.
          </p>
          <Button asChild variant="outline">
            <Link href="/truck-sheets/new">Import your first sheets</Link>
          </Button>
        </Card>
      ) : (
        byDate.map(([date, dateSheets]) => {
          const dayTotal = dateSheets.reduce(
            (sum, s) => sum + sheetStats(s).dispensed,
            0
          )
          return (
            <section key={date} className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-border pb-1">
                <h2 className="font-semibold">{formatDate(date)}</h2>
                <span className="text-xs text-muted-foreground">
                  {dateSheets.length} truck{dateSheets.length === 1 ? '' : 's'}{' '}
                  · {dayTotal.toFixed(0)} gal dispensed
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dateSheets.map((sheet) => {
                  const stats = sheetStats(sheet)
                  const isJetA = sheet.fuel_type === 'jet_a'
                  return (
                    <Card
                      key={sheet.id}
                      className="p-4 hover:border-primary/50 transition-colors cursor-pointer group"
                      onClick={() => router.push(`/truck-sheets/${sheet.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Droplets
                            className={cn(
                              'w-4 h-4',
                              isJetA ? 'text-sky-400' : 'text-emerald-400'
                            )}
                          />
                          <span className="font-mono font-semibold text-lg">
                            {sheet.truck_number}
                          </span>
                          <Badge variant={isJetA ? 'default' : 'secondary'}>
                            {isJetA ? 'Jet A' : 'Avgas'}
                          </Badge>
                        </div>
                        <button
                          type="button"
                          title="Delete sheet"
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (
                              confirm(
                                `Delete truck ${sheet.truck_number} sheet for ${date}?`
                              )
                            ) {
                              deleteSheet(sheet.id)
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-xl font-semibold">
                            {stats.dispensed.toFixed(0)}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            gal dispensed
                          </div>
                        </div>
                        <div>
                          <div className="text-xl font-semibold">
                            {stats.fuelings}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            fuelings
                          </div>
                        </div>
                        <div>
                          <div className="text-xl font-semibold">
                            {stats.tankFills}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            tank fills
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                        {sheet.fueler_initials && (
                          <span>Init: {sheet.fueler_initials}</span>
                        )}
                        {stats.transfers > 0 && (
                          <span className="flex items-center gap-1">
                            <ArrowUpDown className="w-3 h-3" />{' '}
                            {stats.transfers} transfer
                            {stats.transfers === 1 ? '' : 's'}
                          </span>
                        )}
                        {stats.warnings > 0 && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <AlertTriangle className="w-3 h-3" />{' '}
                            {stats.warnings} check
                            {stats.warnings === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
