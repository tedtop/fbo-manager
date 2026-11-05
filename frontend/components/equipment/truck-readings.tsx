'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScanPages } from '@/components/truck-sheets/scan-pages'
import { useTruckSheetScans } from '@/hooks/use-truck-scans'
import { useTruckSheetsForEquipment } from '@/hooks/use-truck-sheets'
import { summarizeSheet } from '@/lib/truck-sheet-summary'
import { ErrorMessage } from '@/messages/error-message'

const PAGE = 30

const fmt = (n: number | null, digits = 0) => (n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits }))

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Meter readings and scanned pages of a fuel truck, newest sheet first, 30 sheets at a time. Renders nothing when
 * the equipment has no truck sheets or the user cannot read them (RLS/permission error), so non-trucks show no section.
 */
export function TruckReadings({ equipmentId, truckNumber }: { equipmentId: number; truckNumber: string }) {
  const [limit, setLimit] = useState(PAGE)
  const { data: sheets = [], isError, error } = useTruckSheetsForEquipment(equipmentId, limit)
  const { data: scans, isLoading: scansLoading, error: scansError } = useTruckSheetScans(sheets.map((s) => s.id))

  if (sheets.length === 0) return null
  const hasMore = sheets.length >= limit

  return (
    <section className="space-y-3" data-testid="readings-section">
      <h2 className="text-lg font-semibold">Meter readings and scans</h2>
      {isError && <ErrorMessage>{(error as Error).message}</ErrorMessage>}
      {scansError && <ErrorMessage>Could not load the scans: {(scansError as Error).message}</ErrorMessage>}
      <ul className="space-y-3">
        {sheets.map((sheet) => {
          const s = summarizeSheet(sheet)
          const facts: [string, string][] = [
            ['Front meter', `${fmt(s.frontStart, 1)} → ${fmt(s.frontEnd, 1)}`],
            ['Rear meter', `${fmt(s.rearStart, 1)} → ${fmt(s.rearEnd, 1)}`],
            ['Gallons pumped', fmt(s.gallonsPumped, 1)],
            ['Starting gallons', fmt(s.startingGallons, 1)],
            ['Remaining', fmt(s.remainingGallons, 1)],
            ['Initials', sheet.fueler_initials ?? '—'],
          ]
          return (
            <li key={sheet.id}>
              <Card className="p-4 space-y-3" data-testid={`truck-day-${sheet.sheet_date}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatDate(sheet.sheet_date)}</span>
                    <Badge variant={sheet.fuel_type === 'jet_a' ? 'default' : 'secondary'}>
                      {sheet.fuel_type === 'jet_a' ? 'Jet A' : 'Avgas'}
                    </Badge>
                  </div>
                  <Link href={`/truck-sheets/${sheet.id}`} className="text-sm underline">
                    Open the sheet
                  </Link>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
                      <dd className="font-mono text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                {scansLoading && !scans ? (
                  <p className="text-xs text-muted-foreground">Loading scans…</p>
                ) : (
                  <ScanPages pages={scans?.get(sheet.id) ?? []} label={`Truck ${truckNumber}, ${sheet.sheet_date}`} />
                )}
              </Card>
            </li>
          )
        })}
      </ul>
      {hasMore && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)} data-testid="show-more-sheets">
          Show more
        </Button>
      )}
    </section>
  )
}
