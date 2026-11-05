'use client'

import { use, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Fuel } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScanPages } from '@/components/truck-sheets/scan-pages'
import { useSession } from '@/hooks/use-session'
import { useTruckSheetScans } from '@/hooks/use-truck-scans'
import { useTruckSheets } from '@/hooks/use-truck-sheets'
import { ErrorMessage } from '@/messages/error-message'

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function TruckDetailPage({ params }: { params: Promise<{ truckNo: string }> }) {
  const { truckNo: raw } = use(params)
  const truckNo = decodeURIComponent(raw)
  const { status } = useSession()
  const router = useRouter()
  const { data: allSheets = [], isLoading, error } = useTruckSheets()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const sheets = useMemo(
    () => allSheets.filter((s) => s.truck_number === truckNo).sort((a, b) => b.sheet_date.localeCompare(a.sheet_date) || b.id - a.id),
    [allSheets, truckNo]
  )
  const { data: scans, isLoading: scansLoading, error: scansError } = useTruckSheetScans(sheets.map((s) => s.id))

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <Link href="/truck-sheets" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Fuel Truck Logs
        </Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
          <Fuel className="w-6 h-6 text-primary" />
          Truck {truckNo}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Truck sheets by day, with the scanned pages</p>
      </div>

      {error && <ErrorMessage>{(error as Error).message}</ErrorMessage>}
      {scansError && <ErrorMessage>Could not load the scans: {(scansError as Error).message}</ErrorMessage>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !error && sheets.length === 0 && (
        <p className="text-sm text-muted-foreground">No truck sheets for truck {truckNo} yet.</p>
      )}

      <div className="space-y-4">
        {sheets.map((sheet) => (
          <Card key={sheet.id} className="p-4 space-y-3" data-testid={`truck-day-${sheet.sheet_date}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{formatDate(sheet.sheet_date)}</span>
                <Badge variant={sheet.fuel_type === 'jet_a' ? 'default' : 'secondary'}>
                  {sheet.fuel_type === 'jet_a' ? 'Jet A' : 'Avgas'}
                </Badge>
                <span className="text-xs text-muted-foreground">{sheet.readings.length} readings</span>
              </div>
              <Link href={`/truck-sheets/${sheet.id}`} className="text-sm underline">
                Open the sheet
              </Link>
            </div>
            {scansLoading && !scans ? (
              <p className="text-xs text-muted-foreground">Loading scans…</p>
            ) : (
              <ScanPages pages={scans?.get(sheet.id) ?? []} label={`Truck ${truckNo}, ${sheet.sheet_date}`} />
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
