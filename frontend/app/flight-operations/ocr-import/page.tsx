'use client'

import { useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, Loader2, Plane } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OcrUpload } from '@/components/flight-operations/ocr-upload'
import { OcrReviewTable } from '@/components/flight-operations/ocr-review-table'
import {
  useOcrExtract,
  useOcrCommit,
  useAircraftList,
  type ReviewFlight,
} from '@/hooks/use-ocr-import'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

export default function OcrImportPage() {
  const router = useRouter()
  const idPrefix = useId()

  const { mutateAsync: extract, isPending: extracting, error: extractError } = useOcrExtract()
  const { mutateAsync: commit, isPending: committing } = useOcrCommit()
  const { data: aircraftList = [] } = useAircraftList()
  const knownTails = new Set(aircraftList.map((a) => a.tail_number))

  const [flights, setFlights] = useState<ReviewFlight[]>([])
  const [scheduleDate, setScheduleDate] = useState(todayIso())
  const [dateLocked, setDateLocked] = useState(false) // true when Claude detected the date
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setFlights([])
    setImportedCount(null)
    setCommitError(null)

    try {
      const result = await extract(file)

      if (result.schedule_date) {
        setScheduleDate(result.schedule_date)
        setDateLocked(true)
      } else {
        setDateLocked(false)
      }

      const reviewFlights: ReviewFlight[] = result.flights.map((f, i) => ({
        ...f,
        id: `${idPrefix}-${i}`,
        include: true,
      }))
      setFlights(reviewFlights)
    } catch {
      // error surfaced via extractError
    }
  }

  async function handleImport() {
    setCommitError(null)
    try {
      const created = await commit({ flights, scheduleDate })
      setImportedCount(created.length)
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const readyToImport = flights.some((f) => f.include && f.tail_number)
  const newAircraftCount = flights.filter(
    (f) => f.include && f.tail_number && !knownTails.has(f.tail_number),
  ).length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Plane className="w-6 h-6 text-primary" />
            Import Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan or upload a printed flight schedule to import flights automatically
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <OcrUpload onFile={handleFile} loading={extracting} />

      {/* Extraction error */}
      {extractError && (
        <ErrorMessage>{(extractError as Error).message}</ErrorMessage>
      )}

      {/* Results section */}
      {flights.length > 0 && (
        <div className="space-y-4">
          {/* Date row */}
          <Card className="bg-card border-border p-4">
            <div className="flex items-center gap-4">
              <CalendarDays className="w-5 h-5 text-primary shrink-0" />
              <div className="flex items-center gap-3 flex-1">
                <Label htmlFor={`${idPrefix}-date`} className="text-sm font-medium whitespace-nowrap">
                  Schedule date
                </Label>
                <Input
                  id={`${idPrefix}-date`}
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-44"
                />
                {dateLocked && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    Detected from document
                  </span>
                )}
                {!dateLocked && (
                  <span className="text-xs text-amber-400">
                    Date not detected — please confirm
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Review table */}
          <OcrReviewTable
            flights={flights}
            knownTails={knownTails}
            onChange={setFlights}
          />

          {/* Commit error */}
          {commitError && <ErrorMessage>{commitError}</ErrorMessage>}

          {/* Import success */}
          {importedCount !== null && (
            <SuccessMessage>
              {importedCount} flight{importedCount !== 1 ? 's' : ''} imported successfully.{' '}
              <Link href="/" className="underline font-medium">View flight board →</Link>
            </SuccessMessage>
          )}

          {/* Action bar */}
          {importedCount === null && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {newAircraftCount > 0 && (
                  <span className="text-amber-400">
                    {newAircraftCount} new aircraft will be created in the registry
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFlights([])
                    setImportedCount(null)
                    setCommitError(null)
                  }}
                >
                  Start over
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!readyToImport || committing || !scheduleDate}
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Importing…
                    </>
                  ) : (
                    `Import ${flights.filter((f) => f.include && f.tail_number).length} flights`
                  )}
                </Button>
              </div>
            </div>
          )}

          {importedCount !== null && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setFlights([]); setImportedCount(null) }}>
                Import another schedule
              </Button>
              <Button onClick={() => router.push('/')}>
                Go to flight board
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
