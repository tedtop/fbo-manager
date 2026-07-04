'use client'

import { TruckSheetReview } from '@/components/truck-sheets/truck-sheet-review'
import {
  type PageProgress,
  TruckSheetUpload
} from '@/components/truck-sheets/truck-sheet-upload'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import {
  type ExtractedTruckSheet,
  type ReviewSheet,
  mergeExtractions,
  useTruckSheetCommit,
  useTruckSheetExtract
} from '@/hooks/use-truck-sheet-import'
import { useFuelTrucks } from '@/hooks/use-truck-sheets'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import { ArrowLeft, CheckCircle2, Loader2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

export default function TruckSheetImportPage() {
  const { status } = useSession()
  const router = useRouter()

  const { mutateAsync: extract } = useTruckSheetExtract()
  const { mutateAsync: commit, isPending: committing } = useTruckSheetCommit()
  const { data: trucks = [] } = useFuelTrucks()
  const knownTruckNumbers = new Set(trucks.map((t) => t.equipment_id))

  const [pages, setPages] = useState<PageProgress[]>([])
  const [extracting, setExtracting] = useState(false)
  const [sheets, setSheets] = useState<ReviewSheet[]>([])
  const [extractError, setExtractError] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState<number | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  async function handleFiles(files: File[]) {
    setExtracting(true)
    setExtractError(null)
    setImportedCount(null)
    setPages(files.map((f) => ({ name: f.name, status: 'queued' as const })))

    const results: { file: File; extraction: ExtractedTruckSheet }[] = []
    for (let i = 0; i < files.length; i++) {
      setPages((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: 'extracting' } : p))
      )
      try {
        const extraction = await extract(files[i])
        results.push({ file: files[i], extraction })
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: 'done', truckNumber: extraction.truck_number }
              : p
          )
        )
      } catch (err) {
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: 'error', error: (err as Error).message }
              : p
          )
        )
      }
    }

    const merged = mergeExtractions(results).map((sheet) => ({
      ...sheet,
      sheet_date: sheet.sheet_date || todayIso()
    }))
    setSheets(merged)
    if (results.length === 0 && files.length > 0) {
      setExtractError(
        'No sheets could be extracted — check the photos and try again.'
      )
    }
    setExtracting(false)
  }

  async function handleImport() {
    setCommitError(null)
    try {
      const created = await commit(sheets)
      setImportedCount(created.length)
      setSheets([])
      setPages([])
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
    sheets.every((s) => s.truck_number && s.sheet_date && s.fuel_type)

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
          Upload photos of tonight&apos;s truck sheets — every meter reading is
          extracted with AI, checked against the registers, and filed under the
          right truck.
        </p>
      </div>

      {importedCount != null && (
        <SuccessMessage>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Imported {importedCount} truck sheet{importedCount === 1 ? '' : 's'}
            .{' '}
            <Link href="/truck-sheets" className="underline">
              View the fuel truck logs
            </Link>
          </span>
        </SuccessMessage>
      )}

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
                onChange={updateSheet}
                onRemove={() =>
                  setSheets((prev) => prev.filter((s) => s.id !== sheet.id))
                }
              />
            ))}
          </div>

          {commitError && <ErrorMessage>{commitError}</ErrorMessage>}

          <div className="flex items-center justify-end gap-3 pb-8">
            <span className="text-sm text-muted-foreground">
              {sheets.length} sheet{sheets.length === 1 ? '' : 's'} ·{' '}
              {totalReadings} readings
            </span>
            <Button
              onClick={handleImport}
              disabled={!readyToImport || committing}
            >
              {committing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" /> Import {sheets.length}{' '}
                  sheet
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
