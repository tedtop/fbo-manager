'use client'

import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ScheduleReview } from '@/components/flight-operations/schedule-import/schedule-review'
import { ScheduleUpload } from '@/components/flight-operations/schedule-import/schedule-upload'
import { Button } from '@/components/ui/button'
import { useScheduleImport } from '@/hooks/use-schedule-import'
import { useSession } from '@/hooks/use-session'
import { useToast } from '@/hooks/use-toast'

// B45b: scan the front desk's printed schedule, review every flight, then import. Access is gated by the
// flight_operations module (lib/access.ts: /flight-operations/*), same as the board.
export default function ScheduleImportPage() {
  const { status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const imp = useScheduleImport()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  async function handleImport() {
    const res = await imp.importAll()
    if (!res) return
    const parts = [`${res.added} added`, `${res.updated} updated`, `${res.skipped} skipped`]
    if (res.failed.length > 0) parts.push(`${res.failed.length} failed`)
    toast({
      title: res.failed.length > 0 ? 'Schedule imported with problems' : 'Schedule imported',
      description: parts.join(', '),
      variant: res.failed.length > 0 ? 'destructive' : undefined
    })
  }

  const showReview = (imp.phase === 'ready' || imp.phase === 'importing') && imp.items.length > 0

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4 sm:px-6 sm:py-6">
      <div>
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Flight board
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photograph the printed schedule. Each flight is shown for review; flights already on the board are never overwritten.
        </p>
      </div>

      {imp.phase === 'done' && imp.result && (
        <div className="space-y-3 rounded-xl border border-border p-4" data-testid="import-result">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-5 w-5 text-green-600" /> {imp.result.added} added, {imp.result.updated} updated, {imp.result.skipped} skipped
          </div>
          {imp.result.failed.length > 0 && (
            <ul role="alert" className="space-y-1 text-sm text-destructive">
              {imp.result.failed.map((f) => (
                <li key={`${f.itemId}-${f.message}`}>
                  {f.tail || 'Row'}: {f.message}
                </li>
              ))}
            </ul>
          )}
          {imp.result.sheetSaveError && (
            <p role="status" data-testid="sheet-save-warning" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Flights imported, but the original sheet could not be saved: {imp.result.sheetSaveError}</span>
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11 sm:h-9">
              <Link href="/">View the board</Link>
            </Button>
            <Button variant="outline" className="h-11 sm:h-9" onClick={imp.reset}>
              Scan another sheet
            </Button>
          </div>
        </div>
      )}

      {(imp.phase === 'idle' || imp.phase === 'extracting' || (imp.phase === 'ready' && imp.items.length === 0)) && (
        <ScheduleUpload onFiles={imp.upload} busy={imp.phase === 'extracting'} error={imp.error} />
      )}

      {showReview && (
        <>
          {imp.sheet && (
            <p className="text-sm text-muted-foreground" data-testid="sheet-info">
              {imp.sheet.source_software_hint ? `${imp.sheet.source_software_hint} · ` : ''}
              {imp.items.length} flight{imp.items.length === 1 ? '' : 's'} from {imp.sheet.rows.length} printed row{imp.sheet.rows.length === 1 ? '' : 's'}
              {imp.sheet.date_range_start && imp.sheet.date_range_end ? ` · ${imp.sheet.date_range_start} to ${imp.sheet.date_range_end}` : ''}
            </p>
          )}
          {imp.error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {imp.error}
            </div>
          )}
          <ScheduleReview
            items={imp.items}
            evaluations={imp.evaluations}
            lookups={imp.lookups}
            summary={imp.summary}
            canImport={imp.canImport}
            importing={imp.phase === 'importing'}
            onChange={imp.updateItem}
            onUnpair={imp.unpair}
            onImport={handleImport}
            onCancel={imp.reset}
          />
        </>
      )}
    </div>
  )
}
