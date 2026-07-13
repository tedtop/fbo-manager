'use client'

import {
  type IntakeProgress,
  IntakeUpload
} from '@/components/document-intake/intake-upload'
import { InvoiceSlipReview } from '@/components/invoice-slips/invoice-slip-review'
import { TruckSheetReview } from '@/components/truck-sheets/truck-sheet-review'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCustomers } from '@/hooks/use-customers'
import {
  type DocClassification,
  useClassifyDocument
} from '@/hooks/use-document-classify'
import {
  type ReviewInvoiceSlip,
  toReviewSlip,
  useInvoiceSlipCommit,
  useInvoiceSlipExtract
} from '@/hooks/use-invoice-slip-import'
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
import { useEffect, useRef, useState } from 'react'

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

interface UnrecognizedEntry {
  file: File
  notes?: string
  retrying: boolean
  error?: string
}

export default function DocumentIntakePage() {
  const { status } = useSession()
  const router = useRouter()

  const { mutateAsync: classify } = useClassifyDocument()
  const { mutateAsync: extractTruckSheet } = useTruckSheetExtract()
  const { mutateAsync: extractInvoiceSlip } = useInvoiceSlipExtract()
  const { mutateAsync: commitTruckSheets, isPending: committingSheets } =
    useTruckSheetCommit()
  const { mutateAsync: commitInvoiceSlips, isPending: committingSlips } =
    useInvoiceSlipCommit()
  const { data: trucks = [] } = useFuelTrucks()
  const { customers } = useCustomers()
  const knownTruckNumbers = new Set(trucks.map((t) => t.equipment_id))

  const [progress, setProgress] = useState<IntakeProgress[]>([])
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)

  // Accumulated across every batch dropped in this session, so a second
  // smaller drop doesn't wipe out an earlier one — Ted's whole week of
  // backlog may not fit in a single browser file picker selection.
  const truckSheetPagesRef = useRef<
    { file: File; extraction: ExtractedTruckSheet }[]
  >([])
  const [sheets, setSheets] = useState<ReviewSheet[]>([])
  const [slips, setSlips] = useState<ReviewInvoiceSlip[]>([])
  const [unrecognized, setUnrecognized] = useState<UnrecognizedEntry[]>([])

  const [sheetsImported, setSheetsImported] = useState<number | null>(null)
  const [slipsImported, setSlipsImported] = useState<number | null>(null)
  const [sheetsCommitError, setSheetsCommitError] = useState<string | null>(
    null
  )
  const [slipsCommitError, setSlipsCommitError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  async function processOne(file: File, idx: number) {
    setProgress((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, status: 'classifying' } : p))
    )

    let docType: DocClassification
    try {
      const result = await classify(file)
      docType = result.doc_type
      setProgress((prev) =>
        prev.map((p, i) =>
          i === idx ? { ...p, status: 'extracting', docType } : p
        )
      )
    } catch (err) {
      setProgress((prev) =>
        prev.map((p, i) =>
          i === idx
            ? { ...p, status: 'error', error: (err as Error).message }
            : p
        )
      )
      return
    }

    if (docType === 'unrecognized') {
      setProgress((prev) =>
        prev.map((p, i) =>
          i === idx ? { ...p, status: 'unrecognized', docType } : p
        )
      )
      setUnrecognized((prev) => [...prev, { file, retrying: false }])
      return
    }

    try {
      if (docType === 'truck_sheet') {
        const extraction = await extractTruckSheet(file)
        truckSheetPagesRef.current = [
          ...truckSheetPagesRef.current,
          { file, extraction }
        ]
        setProgress((prev) =>
          prev.map((p, i) =>
            i === idx
              ? {
                  ...p,
                  status: 'done',
                  detail: `Truck ${extraction.truck_number}`
                }
              : p
          )
        )
      } else {
        const extraction = await extractInvoiceSlip(file)
        setSlips((prev) => [...prev, toReviewSlip(file, extraction)])
        setProgress((prev) =>
          prev.map((p, i) =>
            i === idx
              ? {
                  ...p,
                  status: 'done',
                  detail: extraction.invoice_number || '(no serial read)'
                }
              : p
          )
        )
      }
    } catch (err) {
      setProgress((prev) =>
        prev.map((p, i) =>
          i === idx
            ? { ...p, status: 'error', error: (err as Error).message }
            : p
        )
      )
    }
  }

  async function handleFiles(files: File[]) {
    setProcessing(true)
    setProcessError(null)
    const startIdx = progress.length
    setProgress((prev) => [
      ...prev,
      ...files.map((f) => ({ name: f.name, status: 'queued' as const }))
    ])

    for (let i = 0; i < files.length; i++) {
      await processOne(files[i], startIdx + i)
    }

    setSheets(
      mergeExtractions(truckSheetPagesRef.current).map((sheet) => ({
        ...sheet,
        sheet_date: sheet.sheet_date || todayIso()
      }))
    )
    setProcessing(false)
  }

  async function retryUnrecognized(
    index: number,
    docType: 'truck_sheet' | 'invoice_slip'
  ) {
    setUnrecognized((prev) =>
      prev.map((u, i) =>
        i === index ? { ...u, retrying: true, error: undefined } : u
      )
    )
    const entry = unrecognized[index]
    try {
      if (docType === 'truck_sheet') {
        const extraction = await extractTruckSheet(entry.file)
        truckSheetPagesRef.current = [
          ...truckSheetPagesRef.current,
          { file: entry.file, extraction }
        ]
        setSheets(
          mergeExtractions(truckSheetPagesRef.current).map((sheet) => ({
            ...sheet,
            sheet_date: sheet.sheet_date || todayIso()
          }))
        )
      } else {
        const extraction = await extractInvoiceSlip(entry.file)
        setSlips((prev) => [...prev, toReviewSlip(entry.file, extraction)])
      }
      setUnrecognized((prev) => prev.filter((_, i) => i !== index))
    } catch (err) {
      setUnrecognized((prev) =>
        prev.map((u, i) =>
          i === index
            ? { ...u, retrying: false, error: (err as Error).message }
            : u
        )
      )
    }
  }

  function discardUnrecognized(index: number) {
    setUnrecognized((prev) => prev.filter((_, i) => i !== index))
  }

  function updateSheet(updated: ReviewSheet) {
    setSheets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  function updateSlip(updated: ReviewInvoiceSlip) {
    setSlips((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function handleImportSheets() {
    setSheetsCommitError(null)
    try {
      const created = await commitTruckSheets(sheets)
      setSheetsImported(created.length)
      setSheets([])
      truckSheetPagesRef.current = []
    } catch (err) {
      setSheetsCommitError((err as Error).message)
    }
  }

  async function handleImportSlips() {
    setSlipsCommitError(null)
    try {
      const created = await commitInvoiceSlips(slips)
      setSlipsImported(created.length)
      setSlips([])
    } catch (err) {
      setSlipsCommitError((err as Error).message)
    }
  }

  const readySheets =
    sheets.length > 0 &&
    sheets.every((s) => s.truck_number && s.sheet_date && s.fuel_type)
  const readySlips =
    slips.length > 0 &&
    slips.every((s) => s.invoice_number && s.aircraft_no && s.customer_name)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <h1 className="text-2xl font-bold mt-2">Document Intake</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drop truck sheets and invoice slips in any mix — multi-page PDFs or
          individual photos. Each file is identified with AI, extracted, and
          routed to the matching review queue below. Nothing here requires
          all-or-nothing matching — unrecognized scans are flagged for manual
          triage instead of being dropped or guessed at.
        </p>
      </div>

      <IntakeUpload onFiles={handleFiles} files={progress} busy={processing} />

      {processError && <ErrorMessage>{processError}</ErrorMessage>}

      {unrecognized.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">
            Needs manual triage ({unrecognized.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            These files couldn&apos;t be confidently classified. Pick the
            correct type to extract them anyway, or discard.
          </p>
          <ul className="divide-y divide-border text-sm">
            {unrecognized.map((entry, idx) => (
              <li
                key={`${entry.file.name}-${idx}`}
                className="flex items-center gap-3 py-2"
              >
                <span className="truncate flex-1">{entry.file.name}</span>
                {entry.error && (
                  <span className="text-xs text-destructive">
                    {entry.error}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={entry.retrying}
                  onClick={() => retryUnrecognized(idx, 'truck_sheet')}
                >
                  It&apos;s a truck sheet
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={entry.retrying}
                  onClick={() => retryUnrecognized(idx, 'invoice_slip')}
                >
                  It&apos;s an invoice slip
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={entry.retrying}
                  onClick={() => discardUnrecognized(idx)}
                >
                  Discard
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sheetsImported != null && (
        <SuccessMessage>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Imported {sheetsImported} truck sheet
            {sheetsImported === 1 ? '' : 's'}.{' '}
            <Link href="/truck-sheets" className="underline">
              View the fuel truck logs
            </Link>
          </span>
        </SuccessMessage>
      )}
      {slipsImported != null && (
        <SuccessMessage>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Imported {slipsImported} invoice slip
            {slipsImported === 1 ? '' : 's'} as drafts.{' '}
            <Link href="/invoicing" className="underline">
              View invoicing
            </Link>
          </span>
        </SuccessMessage>
      )}

      {sheets.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">
            Truck sheets ({sheets.length})
          </h2>
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
          {sheetsCommitError && (
            <ErrorMessage>{sheetsCommitError}</ErrorMessage>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={handleImportSheets}
              disabled={!readySheets || committingSheets}
            >
              {committingSheets ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" /> Import {sheets.length}{' '}
                  truck sheet
                  {sheets.length === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {slips.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">
            Invoice slips ({slips.length})
          </h2>
          <div className="space-y-4">
            {slips.map((slip) => (
              <InvoiceSlipReview
                key={slip.id}
                slip={slip}
                customers={customers}
                onChange={updateSlip}
                onRemove={() =>
                  setSlips((prev) => prev.filter((s) => s.id !== slip.id))
                }
              />
            ))}
          </div>
          {slipsCommitError && <ErrorMessage>{slipsCommitError}</ErrorMessage>}
          <div className="flex items-center justify-end gap-3 pb-8">
            <span className="text-sm text-muted-foreground">
              Imported as drafts — price per gallon isn&apos;t on the slip and
              needs a final check
            </span>
            <Button
              onClick={handleImportSlips}
              disabled={!readySlips || committingSlips}
            >
              {committingSlips ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" /> Import {slips.length}{' '}
                  invoice slip
                  {slips.length === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
