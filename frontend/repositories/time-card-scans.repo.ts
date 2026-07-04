import type { Database, Tables } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Original scans of physical time cards (see frontend/scripts/time-card-schema.sql).
 *
 * SCOPE: storage + linkage scaffolding only. Ted hasn't provided real scans
 * of the physical time cards yet, so there is deliberately no OCR/extraction
 * logic here -- just somewhere for a scan to land (the private 'scans'
 * Storage bucket) and a way to link it to the department_member and pay
 * period it belongs to, once known. Per the same resilience posture as
 * frontend/repositories/scanned-documents.repo.ts (truck-sheet/invoice-slip
 * scans), a scan can be uploaded before anyone has confirmed which employee
 * or pay period it covers -- both are nullable and linked later.
 *
 * Reconciliation note: if/when the shared `scanned_documents` table (PR #31,
 * feat/fuel-invoicing-workflow) lands, the natural follow-up is folding time
 * cards into it (add a 'time_card' doc_type, migrate rows, drop this table)
 * rather than maintaining two parallel scan tables. Kept separate for now so
 * this doesn't have to guess at that table's final shape before it merges.
 */

export const TIME_CARD_SCANS_BUCKET = 'scans'

export type TimeCardScanRow = Tables<'time_card_scan'>

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
}

/** time_card/{yyyy}/{mm}/{uuid}-{filename} -- unique, sortable, greppable. */
export function buildTimeCardScanPath(filename: string): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `time_card/${yyyy}/${mm}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`
}

export interface UploadTimeCardScanInput {
  file: File | Blob
  filename: string
  pageNumber?: number | null
  departmentMemberId?: number | null
  payPeriodStart?: string | null
  payPeriodEnd?: string | null
  notes?: string | null
}

/**
 * Persists an original time card scan: uploads the bytes to the private
 * bucket, then records the metadata row. If the metadata insert fails the
 * uploaded object is removed best-effort so the bucket doesn't accumulate
 * orphans.
 */
export async function uploadTimeCardScan(
  db: SupabaseClient<Database>,
  input: UploadTimeCardScanInput
): Promise<TimeCardScanRow> {
  const path = buildTimeCardScanPath(input.filename)
  const contentType =
    input.file instanceof File && input.file.type
      ? input.file.type
      : 'application/octet-stream'

  const { error: uploadError } = await db.storage
    .from(TIME_CARD_SCANS_BUCKET)
    .upload(path, input.file, { contentType, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await db
    .from('time_card_scan')
    .insert({
      storage_bucket: TIME_CARD_SCANS_BUCKET,
      storage_path: path,
      original_filename: input.filename,
      content_type: contentType,
      byte_size: input.file.size,
      page_number: input.pageNumber ?? null,
      department_member_id: input.departmentMemberId ?? null,
      pay_period_start: input.payPeriodStart ?? null,
      pay_period_end: input.payPeriodEnd ?? null,
      notes: input.notes ?? null
    })
    .select()
    .single()
  if (error) {
    await db.storage.from(TIME_CARD_SCANS_BUCKET).remove([path])
    throw error
  }
  return data
}

/** Signed URL for viewing a scan (the bucket is private by design). */
export async function getTimeCardScanSignedUrl(
  db: SupabaseClient<Database>,
  scan: Pick<TimeCardScanRow, 'storage_bucket' | 'storage_path'>,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await db.storage
    .from(scan.storage_bucket)
    .createSignedUrl(scan.storage_path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export async function findTimeCardScansForMember(
  db: SupabaseClient<Database>,
  departmentMemberId: number
): Promise<TimeCardScanRow[]> {
  const { data, error } = await db
    .from('time_card_scan')
    .select('*')
    .eq('department_member_id', departmentMemberId)
    .order('pay_period_start', { ascending: false, nullsFirst: false })
    .order('page_number', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function findTimeCardScansForPayPeriod(
  db: SupabaseClient<Database>,
  payPeriodStart: string
): Promise<TimeCardScanRow[]> {
  const { data, error } = await db
    .from('time_card_scan')
    .select('*')
    .eq('pay_period_start', payPeriodStart)
    .order('created_at')
  if (error) throw error
  return data
}

/** Scans uploaded but not yet matched to an employee / pay period. */
export async function findUnlinkedTimeCardScans(
  db: SupabaseClient<Database>
): Promise<TimeCardScanRow[]> {
  const { data, error } = await db
    .from('time_card_scan')
    .select('*')
    .is('department_member_id', null)
    .is('pay_period_start', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function linkTimeCardScanToMember(
  db: SupabaseClient<Database>,
  scanId: number,
  departmentMemberId: number
): Promise<TimeCardScanRow> {
  const { data, error } = await db
    .from('time_card_scan')
    .update({ department_member_id: departmentMemberId })
    .eq('id', scanId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function linkTimeCardScanToPayPeriod(
  db: SupabaseClient<Database>,
  scanId: number,
  payPeriodStart: string,
  payPeriodEnd: string
): Promise<TimeCardScanRow> {
  const { data, error } = await db
    .from('time_card_scan')
    .update({ pay_period_start: payPeriodStart, pay_period_end: payPeriodEnd })
    .eq('id', scanId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Removes the metadata row AND the stored object. */
export async function deleteTimeCardScan(
  db: SupabaseClient<Database>,
  scan: Pick<TimeCardScanRow, 'id' | 'storage_bucket' | 'storage_path'>
): Promise<void> {
  const { error } = await db.from('time_card_scan').delete().eq('id', scan.id)
  if (error) throw error
  const { error: storageError } = await db.storage
    .from(scan.storage_bucket)
    .remove([scan.storage_path])
  if (storageError) throw storageError
}
