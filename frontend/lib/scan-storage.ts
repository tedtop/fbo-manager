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

/** 8 hex chars from the platform random source. */
export function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
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

export interface TruckPageRef {
  date: string | null
  truckNo: string | null
  /** 1-based page number on that truck/day. */
  page: number
  /** Only to avoid a collision with an object that already exists. */
  suffix?: string
  /** Day the scan was made (YYYY-MM-DD), used by the unassigned holding folder. */
  scanDay?: string
}

/** Upright page image. Falls back to truck_sheet/unassigned/<scan-day>/ when date or truck is not valid. */
export function buildTruckSheetPagePath(ref: TruckPageRef): string {
  const date = validDate(ref.date)
  const truck = sanitizeTruckNo(ref.truckNo)
  const page = Math.max(1, Math.floor(ref.page))
  const tail = ref.suffix ? `-${ref.suffix.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}` : ''
  if (date && truck) {
    return `${dayDir('truck_sheet', date)}/truck-${truck}/${date}_truck-${truck}_p${page}${tail}.jpg`
  }
  const day = validDate(ref.scanDay) ?? new Date().toISOString().slice(0, 10)
  return `truck_sheet/unassigned/${day}/${day}_${ref.suffix || shortId()}_p${page}.jpg`
}

/** Original upload (PDF or photo, as received), stored once per upload. */
export function buildTruckSheetOriginalPath(ref: {
  date: string | null
  truckNo: string | null
  shortId: string
  ext: string
  scanDay?: string
}): string {
  const date = validDate(ref.date)
  const truck = sanitizeTruckNo(ref.truckNo)
  const id = ref.shortId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || shortId()
  const ext = ref.ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin'
  if (date && truck) {
    return `${dayDir('truck_sheet', date)}/truck-${truck}/original/${date}_truck-${truck}_${id}.${ext}`
  }
  const day = validDate(ref.scanDay) ?? new Date().toISOString().slice(0, 10)
  return `truck_sheet/unassigned/${day}/original/${day}_${id}.${ext}`
}

/** Front-desk schedule sheet original, by the sheet's date (scan day when the date is not known). */
export function buildScheduleSheetPath(ref: { date: string | null; shortId: string; ext: string; scanDay?: string }): string {
  const date = validDate(ref.date) ?? validDate(ref.scanDay) ?? new Date().toISOString().slice(0, 10)
  const id = ref.shortId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || shortId()
  const ext = ref.ext.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin'
  return `${dayDir('schedule_sheet', date)}/${date}_schedule_${id}.${ext}`
}
