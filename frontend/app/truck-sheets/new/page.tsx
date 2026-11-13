'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import { useFuelerCandidates } from '@/hooks/use-fueler-candidates'
import { useFuelTrucks } from '@/hooks/use-truck-sheets'
import {
  mergeExtractions,
  prepareReviewPage,
  sheetProblem,
  useSheetChecks,
  useTruckSheetCommit,
  useTruckSheetExtract,
  type CommitResult,
  type ExtractedTruckSheet,
  type ReviewPage,
  type ReviewSheet,
} from '@/hooks/use-truck-sheet-import'
import {
  TruckSheetUpload,
  type PageProgress,
} from '@/components/truck-sheets/truck-sheet-upload'
import { TruckSheetReview } from '@/components/truck-sheets/truck-sheet-review'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'

export default function TruckSheetImportPage() {
  const { status } = useSession()
  const router = useRouter()

  const { mutateAsync: extract } = useTruckSheetExtract()
  const { mutateAsync: commit, isPending: committing } = useTruckSheetCommit()
  const { data: trucks = [] } = useFuelTrucks()
  const { data: fuelers } = useFuelerCandidates()
  const knownTruckNumbers = new Set(trucks.map((t) => t.equipment_id))

  const [pages, setPages] = useState<PageProgress[]>([])
  const [extracting, setExtracting] = useState(false)
  const [sheets, setSheets] = useState<ReviewSheet[]>([])
  const [extractError, setExtractError] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CommitResult | null>(null)
  const { checks, pending: checksPending } = useSheetChecks(sheets)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  async function handleFiles(files: File[]) {
    setExtracting(true)
    setExtractError(null)
    setSummary(null)
    setPages(files.map((f) => ({ name: f.name, status: 'queued' as const })))

    const results: { file: File; extraction: ExtractedTruckSheet; page: ReviewPage }[] = []
    for (let i = 0; i < files.length; i++) {
      setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: 'extracting' } : p)))
      try {
        const extraction = await extract(files[i])
        // The upright image that will be stored (turned as the reader asked) and its hash, made here so the review
        // screen shows exactly what gets saved.
        const page = await prepareReviewPage(files[i], extraction)
        results.push({ file: files[i], extraction, page })
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'done', truckNumber: extraction.truck_number } : p
          )
        )
      } catch (err) {
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'error', error: (err as Error).message } : p
          )
        )
      }
    }

    setSheets(mergeExtractions(results))
    if (results.length === 0 && files.length > 0) {
      setExtractError('No sheets could be extracted — check the photos and try again.')
    }
    setExtracting(false)
  }

  async function handleImport() {
    setCommitError(null)
    try {
      const result = await commit(sheets)
      setSummary(result)
      // Imported sheets leave the screen; failed ones stay, with the reason shown below
      const failedIds = new Set(result.failed.map((f) => f.sheetId))
      setSheets((prev) => prev.filter((s) => failedIds.has(s.id)))
      if (result.failed.length === 0) setPages([])
    } catch (err) {
      setCommitError((err as Error).message)
    }
  }

  function updateSheet(updated: ReviewSheet) {
    setSheets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  const totalReadings = sheets.reduce(
    (sum, s) => sum + s.readings.filter((r) => r.include).length,
    0
  )
  const readyToImport =
    sheets.length > 0 &&
    !extracting &&
    !checksPending &&
    sheets.every((s) => {
      const check = checks.get(s.id)
      return !sheetProblem(s) && check != null && !check.decision.blocked
    })

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <Link
          href="/truck-sheets"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Fuel Truck Logs
        </Link>
        <h1 className="text-2xl font-bold mt-2">Import Truck Sheets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload photos or a PDF scan of tonight&apos;s truck sheets — every meter reading is read from
          the page, checked against the registers, and filed under the right truck together with the
          upright scan of each page.
        </p>
      </div>

      {summary && (summary.created.length > 0 || summary.attached.length > 0) && (
        <SuccessMessage>
          <span className="flex flex-wrap items-center gap-2" data-testid="import-summary">
            <CheckCircle2 className="w-4 h-4" />
            {summary.created.length > 0 && (
              <>Imported {summary.created.length} truck sheet{summary.created.length === 1 ? '' : 's'}. </>
            )}
            {summary.attached.length > 0 && (
              <>
                Added pages to {summary.attached.length} existing sheet{summary.attached.length === 1 ? '' : 's'}.{' '}
              </>
            )}
            <Link href="/truck-sheets" className="underline">
              View the fuel truck logs
            </Link>
          </span>
        </SuccessMessage>
      )}
      {summary?.skippedPages.map((m) => (
        <div key={m} role="status" className="rounded-lg border border-border px-3 py-2 text-sm">{m}</div>
      ))}
      {summary?.failed.map((f) => (
        <ErrorMessage key={f.sheetId}>
          Truck {f.truck || '?'} {f.date}: not imported. {f.message}
        </ErrorMessage>
      ))}

      <TruckSheetUpload onFiles={handleFiles} pages={pages} busy={extracting} />

      {extractError && <ErrorMessage>{extractError}</ErrorMessage>}

      {sheets.length > 0 && (
        <>
          <div className="space-y-4">
            {sheets.map((sheet) => (
              <TruckSheetReview
                key={sheet.id}
                sheet={sheet}
                knownTruckNumbers={knownTruckNumbers}
                fuelers={fuelers}
                check={checks.get(sheet.id)}
                onChange={updateSheet}
                onRemove={() => setSheets((prev) => prev.filter((s) => s.id !== sheet.id))}
              />
            ))}
          </div>

          {commitError && <ErrorMessage>{commitError}</ErrorMessage>}

          <div className="flex items-center justify-end gap-3 pb-8">
            <span className="text-sm text-muted-foreground">
              {sheets.length} sheet{sheets.length === 1 ? '' : 's'} · {totalReadings} readings
            </span>
            <Button onClick={handleImport} disabled={!readyToImport || committing}>
              {committing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" /> Import {sheets.length} sheet
                  {sheets.length === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
