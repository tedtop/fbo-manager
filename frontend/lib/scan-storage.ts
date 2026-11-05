// Storage paths for scanned documents in the private 'scans' bucket (pure; layout documented in docs/PLAN.md
// "Truck sheet scan storage and page attachment"). Paths are only built from validated values, never from file names.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` that is a real calendar date (2000-2100), else null. */
export function validDate(value: string | null | undefined): string | null {
  const m = DATE_RE.exec(value ?? '')
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 2000 || y > 2100) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? value! : null
}

/** Truck number reduced to A-Z0-9 (upper case, max 12), else null when nothing usable is left. */
export function sanitizeTruckNo(value: string | null | undefined): string | null {
  const s = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  return s || null
}

/** Lower-case extension from a content type or file name, whitelisted; anything else is 'bin'. */
export function extensionFor(contentType: string, fileName = ''): string {
  const byType: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif'
  }
  if (byType[contentType]) return byType[contentType]
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(fileName)?.[1].toLowerCase()
  return ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'bin'
}

function dayDir(kind: string, date: string): string {
  return `${kind}/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}`
}

const today = () => new Date().toISOString().slice(0, 10)

/** First 8 hex chars of a sha-256 (lower case); anything else is rejected so paths stay clean. */
export function hash8(sha256: string): string {
  const h = sha256.toLowerCase()
  if (!/^[0-9a-f]{8,}$/.test(h)) throw new Error('hash8 needs a hex sha-256')
  return h.slice(0, 8)
}

export type ScanFolder = 'original' | 'pages' | 'thumbs'

function cleanExt(ext: string): string {
  return ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin'
}

/**
 * Truck sheet files: truck_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/truck-<N>/<folder>/<name>. Names carry the first 8 hex of the
 * sha-256 of the file's own bytes, so identical bytes map to the same name (nothing is overwritten, a re-scan with
 * different bytes gets a new name). No database ids. Invalid date or truck: truck_sheet/unassigned/<scan-day>/<folder>/.
 *   original: <date>_truck-<n>_scan-<hash8>.<ext>   pages / thumbs: <date>_truck-<n>_p<N>_<hash8>.jpg
 */
export function buildTruckSheetPath(ref: {
  folder: ScanFolder
  date: string | null
  truckNo: string | null
  /** sha-256 hex of this file's bytes */
  sha256: string
  /** pages and thumbs only */
  page?: number
  /** originals only: extension of the file as received */
  ext?: string
  scanDay?: string
}): string {
  const date = validDate(ref.date)
  const truck = sanitizeTruckNo(ref.truckNo)
  const h = hash8(ref.sha256)
  const page = Math.max(1, Math.floor(ref.page ?? 1))
  const file = (prefix: string) =>
    ref.folder === 'original' ? `${prefix}scan-${h}.${cleanExt(ref.ext ?? 'bin')}` : `${prefix}p${page}_${h}.jpg`
  if (date && truck) {
    return `${dayDir('truck_sheet', date)}/truck-${truck}/${ref.folder}/${file(`${date}_truck-${truck}_`)}`
  }
  const day = validDate(ref.scanDay) ?? today()
  return `truck_sheet/unassigned/${day}/${ref.folder}/${file(`${day}_`)}`
}

/** Schedule sheets: schedule_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/<folder>/<date>_schedule_... (same hash8 naming). */
export function buildScheduleSheetPath(ref: {
  folder: ScanFolder
  date: string | null
  sha256: string
  page?: number
  ext?: string
  scanDay?: string
}): string {
  const date = validDate(ref.date) ?? validDate(ref.scanDay) ?? today()
  const h = hash8(ref.sha256)
  const page = Math.max(1, Math.floor(ref.page ?? 1))
  const name =
    ref.folder === 'original' ? `${date}_schedule_scan-${h}.${cleanExt(ref.ext ?? 'bin')}` : `${date}_schedule_p${page}_${h}.jpg`
  return `${dayDir('schedule_sheet', date)}/${ref.folder}/${name}`
}

/** Lower-case hex SHA-256 of the blob's bytes (browser). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
