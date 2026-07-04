import type { Database, Tables } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

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
export function buildScanPath(docType: ScannedDocType, filename: string): string {
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
