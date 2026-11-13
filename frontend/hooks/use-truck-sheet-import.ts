'use client'

import { createClient } from '@/lib/supabase/client'
import { psiProblem, truckSheetReadingRow } from '@/lib/equipment-log'
import { createReading, deleteReading } from '@/repositories/equipment-log.repo'
import { createEquipment, findAllEquipment } from '@/repositories/equipment.repo'
import {
  createTruckMeterReadings,
  createTruckSheet,
  deleteTruckSheet,
  updateTruckSheet,
  type TruckMeterReadingInsert,
} from '@/repositories/truck-sheets.repo'
import {
  findExistingSheetInfo,
  findStoredHashes,
  insertTruckSheetScanRows,
  removeScanObjects,
  uploadTruckSheetPages,
  type PreparedPage,
} from '@/repositories/scanned-documents.repo'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { originOf } from '@/lib/pdf-to-images'
import { renderUpright, sha256Hex } from '@/lib/scan-image'
import { decideSheet, type ExistingSheetInfo, type SheetDecision } from '@/lib/scan-duplicates'
import { sanitizeTruckNo, validDate } from '@/lib/scan-storage'
import { addRotation, type Rotation } from '@/lib/truck-sheet/rotation'
import { scanKeys } from '@/hooks/use-truck-scans'
import type {
  ExtractedReading,
  ExtractedTruckSheet,
} from '@/app/api/ocr/truck-sheet/route'
import { truckSheetKeys } from '@/hooks/use-truck-sheets'

export type { ExtractedReading, ExtractedTruckSheet }

export interface ReviewReading extends ExtractedReading {
  id: string // local key for editing
  include: boolean
}

/** One scanned page in the review: the received image, the upright rendition that will be stored, and where it came from. */
export interface ReviewPage {
  id: string
  /** The page image as received (a photo, or a page rendered from a PDF): the source of every rotation. */
  file: File
  /** The upload it belongs to (the PDF, or the photo itself) and its page there. */
  original: File
  originalPage: number
  /** Turn the reader asked for, and whether it was sure. */
  autoRotation: Rotation
  rotationConfident: boolean
  /** Clockwise turn currently applied to `file` to get `upright` (changed by the rotate buttons). */
  rotation: Rotation
  upright: Blob
  thumb: Blob
  previewUrl: string
  hash: string
}

export interface ReviewSheet {
  id: string // local key
  sheet_date: string
  truck_number: string
  fuel_type: 'jet_a' | 'avgas' | ''
  gallons_down: string
  starting_gallons: string
  front_meter_start: string
  rear_meter_start: string
  fueler_initials: string
  /** The Line Department user the initials resolved to (or a human picked); '' when none. Saved with the sheet. */
  fueler_user_id: string
  /** DPI and nozzle PSI as written on the sheet (psi); empty when not recorded. Saved as an equipment_reading. */
  dpi_psi: string
  nozzle_psi: string
  page_count: number
  source_files: string[]
  /** The pages in order; the upright images and the originals are persisted to Storage on import. */
  pages: ReviewPage[]
  /** The user chose "add these pages to the existing sheet" (no new readings). */
  attach: boolean
  ocr_raw: unknown[]
  readings: ReviewReading[]
}

export function toNumber(v: string): number | null {
  const n = Number.parseFloat(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}

let localId = 0
function nextId(prefix: string): string {
  localId += 1
  return `${prefix}-${localId}`
}

/** Renders the page upright (turn from the reader unless `rotation` is given), hashes it and makes a preview URL. */
export async function prepareReviewPage(
  file: File,
  extraction: Pick<ExtractedTruckSheet, 'rotation_degrees' | 'rotation_confident'>,
  rotation?: Rotation
): Promise<ReviewPage> {
  const auto = (extraction.rotation_degrees ?? 0) as Rotation
  const turn = rotation ?? auto
  const { blob, thumb } = await renderUpright(file, turn)
  const origin = originOf(file)
  return {
    id: nextId('page'),
    file,
    original: origin.original,
    originalPage: origin.page,
    autoRotation: auto,
    rotationConfident: extraction.rotation_confident ?? false,
    rotation: turn,
    upright: blob,
    thumb,
    previewUrl: URL.createObjectURL(blob),
    hash: await sha256Hex(blob),
  }
}

/** Manual fix: turn an already prepared page by a further quarter turn (negative = counter-clockwise). */
export async function rotateReviewPage(page: ReviewPage, deltaDeg: number): Promise<ReviewPage> {
  const rotation = addRotation(page.rotation, deltaDeg)
  const { blob, thumb } = await renderUpright(page.file, rotation)
  URL.revokeObjectURL(page.previewUrl)
  return { ...page, rotation, upright: blob, thumb, previewUrl: URL.createObjectURL(blob), hash: await sha256Hex(blob) }
}

/**
 * Merge per-page extractions into one ReviewSheet per truck.
 * Pages of the same truck are ordered by front meter start (the register
 * only counts up during the day), falling back to upload order. A page whose
 * truck number could not be read stays a sheet of its own (truck number empty,
 * to be filled in on the review screen).
 */
export function mergeExtractions(
  pages: { file: File; extraction: ExtractedTruckSheet; page: ReviewPage }[]
): ReviewSheet[] {
  const groups = new Map<string, { file: File; extraction: ExtractedTruckSheet; page: ReviewPage }[]>()
  pages.forEach((page, i) => {
    const key = page.extraction.truck_number || `?${i}`
    const group = groups.get(key) ?? []
    group.push(page)
    groups.set(key, group)
  })

  const sheets: ReviewSheet[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const am = toNumber(a.extraction.front_meter_start)
      const bm = toNumber(b.extraction.front_meter_start)
      if (am != null && bm != null) return am - bm
      return 0
    })
    const first = group[0].extraction
    sheets.push({
      id: nextId('sheet'),
      sheet_date: first.sheet_date ?? group.find((p) => p.extraction.sheet_date)?.extraction.sheet_date ?? '',
      truck_number: first.truck_number,
      fuel_type: first.fuel_type,
      gallons_down: first.gallons_down,
      starting_gallons: first.starting_gallons,
      front_meter_start: first.front_meter_start,
      rear_meter_start: first.rear_meter_start,
      fueler_initials: first.fueler_initials,
      fueler_user_id: '',
      dpi_psi: '',
      nozzle_psi: '',
      page_count: group.length,
      source_files: group.map((p) => p.file.name),
      pages: group.map((p) => p.page),
      attach: false,
      ocr_raw: group.map((p) => {
        const { raw_text: _rawText, ...extraction } = p.extraction
        return extraction
      }),
      readings: group.flatMap((p) =>
        p.extraction.readings.map((r) => ({
          ...r,
          id: nextId('reading'),
          include: true,
        }))
      ),
    })
  }
  return sheets.sort((a, b) => a.truck_number.localeCompare(b.truck_number))
}

/** What stops a sheet from being imported on its own data (before the duplicate checks), or null. */
export function sheetProblem(sheet: ReviewSheet): string | null {
  if (!sanitizeTruckNo(sheet.truck_number)) return 'Enter the truck number.'
  if (!validDate(sheet.sheet_date)) return 'Enter the sheet date.'
  if (!sheet.fuel_type) return 'Choose the fuel type.'
  const psi = psiProblem(sheet.dpi_psi, sheet.nozzle_psi)
  if (psi) return psi
  return null
}

export interface SheetCheck {
  existing: ExistingSheetInfo | null
  storedHashes: Set<string>
  decision: SheetDecision
}

/** Live duplicate checks for the sheets on the review screen: same truck + date already stored, pages already stored. */
export function useSheetChecks(sheets: ReviewSheet[]): { checks: Map<string, SheetCheck | undefined>; pending: boolean } {
  const db = createClient()
  const results = useQueries({
    queries: sheets.map((sheet) => {
      const ready = !sheetProblem(sheet)
      const hashes = sheet.pages.map((p) => p.hash)
      return {
        queryKey: [...scanKeys.all, 'check', sheet.truck_number, sheet.sheet_date, hashes.join(',')],
        enabled: ready,
        staleTime: 0,
        queryFn: async () => {
          const [existing, storedHashes] = await Promise.all([
            findExistingSheetInfo(db, sheet.truck_number, sheet.sheet_date),
            findStoredHashes(db, hashes),
          ])
          return { existing, storedHashes }
        },
      }
    }),
  })
  const checks = new Map<string, SheetCheck | undefined>()
  sheets.forEach((sheet, i) => {
    const data = results[i].data
    checks.set(
      sheet.id,
      data
        ? {
            ...data,
            decision: decideSheet({
              existing: data.existing,
              attach: sheet.attach,
              hashes: sheet.pages.map((p) => p.hash),
              storedHashes: data.storedHashes,
            }),
          }
        : undefined
    )
  })
  return { checks, pending: results.some((r) => r.isLoading) }
}

export function useTruckSheetExtract() {
  return useMutation({
    mutationFn: async (file: File): Promise<ExtractedTruckSheet> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr/truck-sheet', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        if (res.status === 429) throw new Error('Too many pages read in the last minute. Wait a minute, then upload the rest.')
        if (res.status === 502) throw new Error(`${err.error ?? 'The reader failed on this page.'} Try this page again in a minute.`)
        throw new Error(err.error ?? 'Extraction failed')
      }
      return res.json()
    },
  })
}

export interface CommitResult {
  created: { id: number; truck: string; date: string; pages: number }[]
  attached: { id: number; truck: string; date: string; pages: number }[]
  /** Pages left out because an identical page is already stored. */
  skippedPages: string[]
  /** Sheets that were not imported, with the reason; their cards stay on the screen. */
  failed: { sheetId: string; truck: string; date: string; message: string }[]
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err)
}

export function useTruckSheetCommit() {
  const db = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sheets: ReviewSheet[]): Promise<CommitResult> => {
      // Fuel trucks in the equipment registry; unknown truck numbers are auto-created
      const equipment = await findAllEquipment(db)
      const trucksById = new Map(
        equipment
          .filter((e) => e.equipment_type === 'fuel_truck')
          .map((e) => [e.equipment_id, e.id])
      )

      const result: CommitResult = { created: [], attached: [], skippedPages: [], failed: [] }

      for (const sheet of sheets) {
        const label = { sheetId: sheet.id, truck: sheet.truck_number, date: sheet.sheet_date }
        let uploadedPaths: string[] = []
        let createdSheetId: number | null = null
        let createdReadingId: number | null = null
        let attachRestore: { id: number; pageCount: number } | null = null
        try {
          const problem = sheetProblem(sheet)
          if (problem) throw new Error(problem)

          // Authoritative duplicate decision at import time (the review screen's view may be stale)
          const hashes = sheet.pages.map((p) => p.hash)
          const [existing, storedHashes] = await Promise.all([
            findExistingSheetInfo(db, sheet.truck_number, sheet.sheet_date),
            findStoredHashes(db, hashes),
          ])
          const decision = decideSheet({ existing, attach: sheet.attach, hashes, storedHashes })
          if (decision.blocked) throw new Error(decision.blocked)
          sheet.pages.forEach((p, i) => {
            if (decision.pages[i].duplicate) {
              result.skippedPages.push(`Truck ${sheet.truck_number} ${sheet.sheet_date}: ${p.original.name} page ${p.originalPage} is already stored, skipped.`)
            }
          })

          let fuelTruckId = existing?.fuelTruckId ?? trucksById.get(sheet.truck_number)
          if (fuelTruckId == null) {
            const truck = await createEquipment(db, {
              equipment_id: sheet.truck_number,
              equipment_name: `Fuel Truck ${sheet.truck_number}`,
              equipment_type: 'fuel_truck',
              notes: `Fuel: ${sheet.fuel_type === 'jet_a' ? 'Jet A' : 'Avgas 100LL'}. Auto-created by truck sheet import.`,
            })
            fuelTruckId = truck.id
            trucksById.set(sheet.truck_number, fuelTruckId)
          }

          // 1. Storage first: the originals (once each) and the upright pages. Nothing is written to the tables yet.
          const keep = sheet.pages.filter((_, i) => !decision.pages[i].duplicate)
          const originals: File[] = []
          const prepared: PreparedPage[] = keep.map((p, i) => {
            let originalIndex = originals.indexOf(p.original)
            if (originalIndex < 0) originalIndex = originals.push(p.original) - 1
            return {
              blob: p.upright,
              thumb: p.thumb,
              rotation: p.rotation,
              hash: p.hash,
              pageNumber: decision.nextPageNumbers[i],
              originalIndex,
              originalPage: p.originalPage,
            }
          })
          const uploaded = await uploadTruckSheetPages(db, {
            sheetDate: sheet.sheet_date,
            truckNumber: sheet.truck_number,
            originals,
            pages: prepared,
          })
          uploadedPaths = uploaded.paths

          // 2. The sheet record (new) or its page count (adding pages to an existing sheet)
          let sheetId: number
          if (decision.mode === 'attach' && existing) {
            sheetId = existing.id
            attachRestore = { id: existing.id, pageCount: existing.pageCount }
            await updateTruckSheet(db, existing.id, { page_count: existing.pageCount + keep.length })
          } else {
            const sheetRow = await createTruckSheet(db, {
              sheet_date: sheet.sheet_date,
              fuel_truck_id: fuelTruckId,
              truck_number: sheet.truck_number,
              fuel_type: sheet.fuel_type as 'jet_a' | 'avgas',
              gallons_down: toNumber(sheet.gallons_down),
              starting_gallons: toNumber(sheet.starting_gallons),
              front_meter_start: toNumber(sheet.front_meter_start),
              rear_meter_start: toNumber(sheet.rear_meter_start),
              fueler_initials: sheet.fueler_initials || null,
              fueler_user_id: sheet.fueler_user_id || null,
              page_count: keep.length,
              ocr_raw: sheet.ocr_raw,
            })
            sheetId = sheetRow.id
            createdSheetId = sheetRow.id

            const inserts: TruckMeterReadingInsert[] = sheet.readings
              .filter((r) => r.include)
              .map((r, idx) => ({
                truck_sheet_id: sheetRow.id,
                line_number: idx + 1,
                reading_type: r.reading_type,
                customer: r.customer || null,
                tail_number: r.tail_number || null,
                aircraft_type: r.aircraft_type || null,
                fuel_type_confirmed: r.fuel_type_confirmed,
                meter: r.meter || null,
                meter_start: toNumber(r.meter_start),
                meter_end: toNumber(r.meter_end),
                gallons_pumped: toNumber(r.gallons_pumped),
                gallons_remaining: toNumber(r.gallons_remaining),
                req_gals_or_lbs: r.req_gals_or_lbs || null,
                prist: r.prist === '' ? null : r.prist === 'yes',
                line_tech_initials: r.line_tech_initials || null,
                invoice_number: r.invoice_number || null,
                service_time: r.service_time || null,
                notes: r.notes || null,
              }))
            await createTruckMeterReadings(db, inserts)

            // DPI / nozzle PSI from the sheet go to the truck's daily log (same history the Equipment page trends)
            const logRow = truckSheetReadingRow({
              equipmentId: fuelTruckId,
              truckSheetId: sheetRow.id,
              sheetDate: sheet.sheet_date,
              dpiText: sheet.dpi_psi,
              nozzleText: sheet.nozzle_psi,
            })
            if (logRow) createdReadingId = (await createReading(db, logRow)).id
          }

          // 3. The page rows, linked to the sheet and the truck
          await insertTruckSheetScanRows(db, { truckSheetId: sheetId, fuelTruckId, drafts: uploaded.drafts })

          const done = { id: sheetId, truck: sheet.truck_number, date: sheet.sheet_date, pages: keep.length }
          if (decision.mode === 'attach') result.attached.push(done)
          else result.created.push(done)
        } catch (err) {
          // Undo this sheet so a truck sheet never stays without its scans: the new record (readings cascade),
          // the page count, and the objects. Whatever cannot be undone is said in the message.
          const leftovers: string[] = []
          if (createdReadingId != null) {
            try {
              await deleteReading(db, createdReadingId)
            } catch {
              leftovers.push(`DPI reading #${createdReadingId} could not be removed again`)
            }
          }
          if (createdSheetId != null) {
            try {
              await deleteTruckSheet(db, createdSheetId)
            } catch {
              leftovers.push(`truck sheet #${createdSheetId} was created but could not be removed again`)
            }
          }
          if (attachRestore) {
            try {
              await updateTruckSheet(db, attachRestore.id, { page_count: attachRestore.pageCount })
            } catch {
              leftovers.push(`the page count of sheet #${attachRestore.id} could not be restored`)
            }
          }
          const stuck = await removeScanObjects(db, uploadedPaths)
          if (stuck.length > 0) leftovers.push(`${stuck.length} uploaded file(s) could not be removed`)
          result.failed.push({
            ...label,
            message: `${describe(err)}${leftovers.length ? ` (cleanup incomplete: ${leftovers.join('; ')})` : ''}`,
          })
        }
      }

      return result
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: truckSheetKeys.all })
      queryClient.invalidateQueries({ queryKey: scanKeys.all })
      queryClient.invalidateQueries({ queryKey: ['equipment-log'] })
    },
  })
}
