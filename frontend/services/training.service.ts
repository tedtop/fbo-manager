import type { StaffMember } from '@/repositories/staff.repo'
import type { TrainingCompletionWithRecorder } from '@/repositories/training-completions.repo'
import { createCompletion } from '@/repositories/training-completions.repo'
import type {
  TrainingCourseRow,
  ValidityUnit
} from '@/repositories/training-courses.repo'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { add, differenceInCalendarDays, format, parseISO } from 'date-fns'

export const CERTIFICATE_BUCKET = 'training-certificates'
export const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024 // 10 MB
export const ACCEPTED_CERTIFICATE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic'
]

/** A completion within this many days of expiry counts as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30

export type ComplianceStatus = 'current' | 'expiring' | 'expired' | 'missing'

export interface CellState {
  status: ComplianceStatus
  latest: TrainingCompletionWithRecorder | null
  history: TrainingCompletionWithRecorder[]
  /** Days until expiry (negative = days overdue). Null when no expiry applies. */
  daysUntilExpiry: number | null
}

export interface ComplianceMatrixData {
  staff: StaffMember[]
  courses: TrainingCourseRow[]
  /** Keyed `${userId}:${courseId}` — one entry per staff × course pair. */
  cells: Map<string, CellState>
  totals: Record<ComplianceStatus, number>
}

export function cellKey(userId: number, courseId: number): string {
  return `${userId}:${courseId}`
}

/**
 * Expiry is stamped at completion time: completed_on + the course's validity
 * period. It is stored on the completion row (not derived on read) so that
 * later edits to a course's validity never re-date certificates issued under
 * the old rule. Courses without a validity period never expire.
 */
export function computeExpiresOn(
  completedOn: string,
  validityAmount: number | null,
  validityUnit: ValidityUnit | null
): string | null {
  if (validityAmount == null || validityUnit == null) return null
  const expires = add(parseISO(completedOn), { [validityUnit]: validityAmount })
  return format(expires, 'yyyy-MM-dd')
}

export function statusForExpiry(
  expiresOn: string | null,
  today: Date = new Date()
): {
  status: Exclude<ComplianceStatus, 'missing'>
  daysUntilExpiry: number | null
} {
  if (!expiresOn) return { status: 'current', daysUntilExpiry: null }
  const days = differenceInCalendarDays(parseISO(expiresOn), today)
  if (days < 0) return { status: 'expired', daysUntilExpiry: days }
  if (days <= EXPIRING_SOON_DAYS)
    return { status: 'expiring', daysUntilExpiry: days }
  return { status: 'current', daysUntilExpiry: days }
}

export function formatValidity(
  course: Pick<TrainingCourseRow, 'validity_amount' | 'validity_unit'>
): string {
  if (course.validity_amount == null || course.validity_unit == null)
    return 'No expiration'
  const unit =
    course.validity_amount === 1
      ? course.validity_unit.replace(/s$/, '')
      : course.validity_unit
  return `${course.validity_amount} ${unit}`
}

/**
 * Assemble the matrix from the three source queries. Completions arrive
 * newest-first; the first one seen per (user, course) is the governing
 * record and the rest are renewal history.
 */
export function buildComplianceMatrix(
  staff: StaffMember[],
  courses: TrainingCourseRow[],
  completions: TrainingCompletionWithRecorder[],
  today: Date = new Date()
): ComplianceMatrixData {
  const cells = new Map<string, CellState>()

  for (const s of staff) {
    for (const c of courses) {
      cells.set(cellKey(s.userId, c.id), {
        status: 'missing',
        latest: null,
        history: [],
        daysUntilExpiry: null
      })
    }
  }

  for (const completion of completions) {
    const cell = cells.get(cellKey(completion.user_id, completion.course_id))
    if (!cell) continue // completion for inactive staff or retired course
    if (!cell.latest) {
      cell.latest = completion
      const { status, daysUntilExpiry } = statusForExpiry(
        completion.expires_on,
        today
      )
      cell.status = status
      cell.daysUntilExpiry = daysUntilExpiry
    }
    cell.history.push(completion)
  }

  const totals: Record<ComplianceStatus, number> = {
    current: 0,
    expiring: 0,
    expired: 0,
    missing: 0
  }
  for (const cell of cells.values()) totals[cell.status] += 1

  return { staff, courses, cells, totals }
}

export function validateCertificateFile(file: File): string | null {
  if (file.size > MAX_CERTIFICATE_BYTES) {
    return 'Certificate file must be 10 MB or smaller'
  }
  if (!ACCEPTED_CERTIFICATE_TYPES.includes(file.type)) {
    return 'Certificate must be a PDF or image (PNG, JPEG, WebP, HEIC)'
  }
  return null
}

export interface RecordCompletionInput {
  userId: number
  course: TrainingCourseRow
  completedOn: string // yyyy-MM-dd
  notes: string
  certificateFile: File | null
  recordedById: number | null
}

/**
 * Record a completion event. Uploads the certificate (if any) first so a
 * failed upload never leaves a completion row pointing at a missing file.
 */
export async function recordCompletion(
  db: SupabaseClient<Database>,
  input: RecordCompletionInput
): Promise<void> {
  let certificatePath: string | null = null
  let certificateName: string | null = null

  if (input.certificateFile) {
    const file = input.certificateFile
    const invalid = validateCertificateFile(file)
    if (invalid) throw new Error(invalid)

    const safeName = file.name.replace(/[^\w.\- ]+/g, '_')
    const path = `${input.userId}/${input.course.id}/${Date.now()}-${safeName}`
    const { error } = await db.storage
      .from(CERTIFICATE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw error
    certificatePath = path
    certificateName = file.name
  }

  await createCompletion(db, {
    course_id: input.course.id,
    user_id: input.userId,
    completed_on: input.completedOn,
    expires_on: computeExpiresOn(
      input.completedOn,
      input.course.validity_amount,
      input.course.validity_unit
    ),
    certificate_path: certificatePath,
    certificate_name: certificateName,
    notes: input.notes,
    recorded_by_id: input.recordedById
  })
}

/** Short-lived signed URL for viewing a stored certificate. */
export async function getCertificateUrl(
  db: SupabaseClient<Database>,
  path: string
): Promise<string> {
  const { data, error } = await db.storage
    .from(CERTIFICATE_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}
