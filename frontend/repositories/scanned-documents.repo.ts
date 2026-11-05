import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExistingSheetInfo } from '@/lib/scan-duplicates'
import { buildScheduleSheetPath, buildTruckSheetPath, extensionFor, sha256Hex } from '@/lib/scan-storage'

/**
 * Original scans of the two paper document types (see
 * docs/architecture/fuel-invoicing-workflow.md and
 * scripts/fuel-invoicing-workflow-schema.sql):
 *
 *   - truck_sheet   — "Truck Sheet Jet A" daily meter log, one photo per
 *                     page; a busy truck's sheet spans several photos
 *                     (page_number keeps their order).
 *   - invoice_slip  — carbon-copy page from a pre-printed invoice book
 *                     (5-digit red serial), one photo per slip.
 *
 * Files live in the private 'scans' Storage bucket; this table is the
 * metadata + linkage record. Per the workflow's resilience posture a scan
 * can be uploaded before anyone knows which truck_sheet/invoice it belongs
 * to — both FKs are nullable and linked later.
 */

export const SCANS_BUCKET = 'scans'

export type ScannedDocumentRow = Tables<'scanned_documents'>
export type ScannedDocType = ScannedDocumentRow['doc_type']

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
}

/** {doc_type}/{yyyy}/{mm}/{uuid}-{filename} — unique, sortable, greppable. */
export function buildScanPath(docType: ScannedDocType | 'schedule_sheet', filename: string): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${docType}/${yyyy}/${mm}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`
}

export interface UploadScanInput {
  docType: ScannedDocType
  file: File | Blob
  filename: string
  pageNumber?: number | null
  truckSheetId?: number | null
  invoiceId?: number | null
  notes?: string | null
}

/**
 * Persists an original scan: uploads the bytes to the private bucket, then
 * records the metadata row. If the metadata insert fails the uploaded
 * object is removed best-effort so the bucket doesn't accumulate orphans.
 */
export async function uploadScannedDocument(
  db: SupabaseClient<Database>,
  input: UploadScanInput
): Promise<ScannedDocumentRow> {
  const path = buildScanPath(input.docType, input.filename)
  const contentType =
    input.file instanceof File && input.file.type
      ? input.file.type
      : 'application/octet-stream'

  const { error: uploadError } = await db.storage
    .from(SCANS_BUCKET)
    .upload(path, input.file, { contentType, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await db
    .from('scanned_documents')
    .insert({
      doc_type: input.docType,
      storage_bucket: SCANS_BUCKET,
      storage_path: path,
      original_filename: input.filename,
      content_type: contentType,
      byte_size: input.file.size,
      page_number: input.pageNumber ?? null,
      truck_sheet_id: input.truckSheetId ?? null,
      invoice_id: input.invoiceId ?? null,
      notes: input.notes ?? null
    })
    .select()
    .single()
  if (error) {
    await db.storage.from(SCANS_BUCKET).remove([path])
    throw error
  }
  return data
}

/**
 * B45b: keeps the original photo/PDF of a front-desk schedule sheet in the private bucket, laid out by the sheet's
 * date: schedule_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/original/<date>_schedule_scan-<hash8>.<ext> (scan day when the date is unknown).
 * Object only, no scanned_documents row yet. Returns the storage path.
 */
export async function uploadScheduleSheetScan(
  db: SupabaseClient<Database>,
  file: File,
  _filename: string,
  sheetDate?: string | null
): Promise<string> {
  const path = buildScheduleSheetPath({
    folder: 'original',
    date: sheetDate ?? null,
    sha256: await sha256Hex(file),
    ext: extensionFor(file.type, file.name),
    scanDay: new Date().toISOString().slice(0, 10)
  })
  const { error } = await db.storage
    .from(SCANS_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error && !alreadyExists(error)) throw error // same name = same bytes: already stored
  return path
}

/** Signed URL for viewing a scan (the bucket is private by design). */
export async function getScanSignedUrl(
  db: SupabaseClient<Database>,
  doc: Pick<ScannedDocumentRow, 'storage_bucket' | 'storage_path'>,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await db.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export async function findScansForTruckSheet(
  db: SupabaseClient<Database>,
  truckSheetId: number
): Promise<ScannedDocumentRow[]> {
  const { data, error } = await db
    .from('scanned_documents')
    .select('*')
    .eq('truck_sheet_id', truckSheetId)
    .order('page_number', { ascending: true, nullsFirst: false })
    .order('created_at')
  if (error) throw error
  return data
}

export async function findScansForInvoice(
  db: SupabaseClient<Database>,
  invoiceId: number
): Promise<ScannedDocumentRow[]> {
  const { data, error } = await db
    .from('scanned_documents')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at')
  if (error) throw error
  return data
}

/** Scans uploaded but not yet matched to a truck sheet / invoice. */
export async function findUnlinkedScans(
  db: SupabaseClient<Database>,
  docType?: ScannedDocType
): Promise<ScannedDocumentRow[]> {
  let q = db
    .from('scanned_documents')
    .select('*')
    .is('truck_sheet_id', null)
    .is('invoice_id', null)
    .order('created_at', { ascending: false })
  if (docType) q = q.eq('doc_type', docType)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function linkScanToTruckSheet(
  db: SupabaseClient<Database>,
  scanId: number,
  truckSheetId: number,
  pageNumber?: number | null
): Promise<ScannedDocumentRow> {
  const { data, error } = await db
    .from('scanned_documents')
    .update({
      truck_sheet_id: truckSheetId,
      ...(pageNumber !== undefined ? { page_number: pageNumber } : {})
    })
    .eq('id', scanId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function linkScanToInvoice(
  db: SupabaseClient<Database>,
  scanId: number,
  invoiceId: number
): Promise<ScannedDocumentRow> {
  const { data, error } = await db
    .from('scanned_documents')
    .update({ invoice_id: invoiceId })
    .eq('id', scanId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Removes the metadata row AND the stored object. */
export async function deleteScannedDocument(
  db: SupabaseClient<Database>,
  doc: Pick<ScannedDocumentRow, 'id' | 'storage_bucket' | 'storage_path'>
): Promise<void> {
  const { error } = await db.from('scanned_documents').delete().eq('id', doc.id)
  if (error) throw error
  const { error: storageError } = await db.storage
    .from(doc.storage_bucket)
    .remove([doc.storage_path])
  if (storageError) throw storageError
}


// ---------------------------------------------------------------------------------------------------------------
// Truck sheet pages (docs/PLAN.md "Truck sheet scan storage and page attachment")
// ---------------------------------------------------------------------------------------------------------------

export type ScanRowDraft = Omit<TablesInsert<'scanned_documents'>, 'truck_sheet_id' | 'fuel_truck_id'>

export interface PreparedPage {
  /** Upright JPEG. */
  blob: Blob
  /** 400 px wide JPEG thumbnail of the same page. */
  thumb: Blob
  /** Clockwise turn applied to the received image to get `blob`. */
  rotation: number
  /** SHA-256 hex of `blob`. */
  hash: string
  /** Number on the truck sheet (1-based, continues after the pages already stored). */
  pageNumber: number
  /** Index into the `originals` list of the upload this page came from. */
  originalIndex: number
  /** 1-based page within that original (1 for a photo). */
  originalPage: number
}

function alreadyExists(err: { message?: string; statusCode?: string | number } | null): boolean {
  return !!err && (String(err.statusCode) === '409' || /already exists|duplicate/i.test(err.message ?? ''))
}

/**
 * Uploads the originals (each once), the upright page images and their thumbnails of one truck sheet. File names carry
 * the first 8 hex of the sha-256 of the file's own bytes: an object that already exists under that name has identical
 * bytes and is reused, different bytes get a different name, so nothing is overwritten. Writes no rows. If anything
 * fails, the objects newly created by this call are removed (reused ones are left) and the error is thrown. Returns the
 * row drafts and the newly created paths (for cleanup if the caller's later step fails).
 */
export async function uploadTruckSheetPages(
  db: SupabaseClient<Database>,
  args: { sheetDate: string; truckNumber: string; originals: File[]; pages: PreparedPage[] }
): Promise<{ drafts: ScanRowDraft[]; paths: string[] }> {
  const created: string[] = []
  const put = async (path: string, body: Blob, contentType: string) => {
    const { error } = await db.storage.from(SCANS_BUCKET).upload(path, body, { contentType, upsert: false })
    if (error && !alreadyExists(error)) throw error
    if (!error) created.push(path)
  }
  try {
    const originalPaths = new Map<number, string>()
    for (const page of args.pages) {
      if (originalPaths.has(page.originalIndex)) continue
      const file = args.originals[page.originalIndex]
      const path = buildTruckSheetPath({
        folder: 'original',
        date: args.sheetDate,
        truckNo: args.truckNumber,
        sha256: await sha256Hex(file),
        ext: extensionFor(file.type, file.name)
      })
      await put(path, file, file.type || 'application/octet-stream')
      originalPaths.set(page.originalIndex, path)
    }

    const drafts: ScanRowDraft[] = []
    for (const page of args.pages) {
      const base = { date: args.sheetDate, truckNo: args.truckNumber, page: page.pageNumber }
      const path = buildTruckSheetPath({ ...base, folder: 'pages', sha256: page.hash })
      await put(path, page.blob, 'image/jpeg')
      const thumbPath = buildTruckSheetPath({ ...base, folder: 'thumbs', sha256: await sha256Hex(page.thumb) })
      await put(thumbPath, page.thumb, 'image/jpeg')
      const original = args.originals[page.originalIndex]
      drafts.push({
        doc_type: 'truck_sheet',
        storage_bucket: SCANS_BUCKET,
        storage_path: path,
        thumb_path: thumbPath,
        original_filename: original.name,
        content_type: 'image/jpeg',
        byte_size: page.blob.size,
        page_number: page.pageNumber,
        rotation_degrees: page.rotation,
        content_sha256: page.hash,
        original_path: originalPaths.get(page.originalIndex) ?? null,
        original_page: page.originalPage,
        original_content_type: original.type || null,
        scan_date: args.sheetDate
      })
    }
    return { drafts, paths: created }
  } catch (err) {
    if (created.length > 0) await db.storage.from(SCANS_BUCKET).remove(created)
    throw err
  }
}

/** Inserts the page rows prepared by uploadTruckSheetPages, linked to the sheet and the truck. */
export async function insertTruckSheetScanRows(
  db: SupabaseClient<Database>,
  args: { truckSheetId: number; fuelTruckId: number; drafts: ScanRowDraft[] }
): Promise<ScannedDocumentRow[]> {
  const { data, error } = await db
    .from('scanned_documents')
    .insert(args.drafts.map((d) => ({ ...d, truck_sheet_id: args.truckSheetId, fuel_truck_id: args.fuelTruckId })))
    .select()
  if (error) throw error
  return data
}

/** Best-effort removal of objects (cleanup after a failed import step). Returns the paths that could not be removed. */
export async function removeScanObjects(db: SupabaseClient<Database>, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return []
  const { error } = await db.storage.from(SCANS_BUCKET).remove(paths)
  return error ? paths : []
}

/** The sheet already stored for this truck number and date (lowest id), with its page count and highest page number. */
export async function findExistingSheetInfo(
  db: SupabaseClient<Database>,
  truckNumber: string,
  sheetDate: string
): Promise<ExistingSheetInfo | null> {
  const { data: sheet, error } = await db
    .from('truck_sheets')
    .select('id, fuel_truck_id')
    .eq('truck_number', truckNumber)
    .eq('sheet_date', sheetDate)
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!sheet) return null
  const { data: scans, error: scanError } = await db
    .from('scanned_documents')
    .select('page_number')
    .eq('truck_sheet_id', sheet.id)
  if (scanError) throw scanError
  const numbers = scans.map((r) => r.page_number ?? 0)
  return { id: sheet.id, pageCount: scans.length, maxPageNumber: Math.max(0, ...numbers), fuelTruckId: sheet.fuel_truck_id }
}

/** Which of these upright-page hashes are already stored (on any sheet). */
export async function findStoredHashes(db: SupabaseClient<Database>, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()
  const { data, error } = await db.from('scanned_documents').select('content_sha256').in('content_sha256', hashes)
  if (error) throw error
  return new Set(data.map((r) => r.content_sha256).filter((h): h is string => !!h))
}

/** Page scans for several truck sheets, in page order. */
export async function findScansForTruckSheets(
  db: SupabaseClient<Database>,
  truckSheetIds: number[]
): Promise<ScannedDocumentRow[]> {
  if (truckSheetIds.length === 0) return []
  const { data, error } = await db
    .from('scanned_documents')
    .select('*')
    .in('truck_sheet_id', truckSheetIds)
    .order('page_number', { ascending: true, nullsFirst: false })
    .order('created_at')
  if (error) throw error
  return data
}

/** Signed URLs (path -> url) for many objects of the private bucket in one request. */
export async function getScanSignedUrls(
  db: SupabaseClient<Database>,
  paths: string[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (paths.length === 0) return out
  const { data, error } = await db.storage.from(SCANS_BUCKET).createSignedUrls(paths, expiresInSeconds)
  if (error) throw error
  for (const row of data) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl)
  return out
}
