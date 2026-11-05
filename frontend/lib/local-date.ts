// Calendar-date helpers (BACKLOG B10, docs/PLAN.md F2/F5). A "date string" is "YYYY-MM-DD" in a time zone.
// Every function takes an optional IANA `zone` (e.g. 'America/Denver', 'UTC'): without it the runtime's
// (browser's) local zone is used, which is what the code did before the board gained a display zone.
// Never derive a date with toISOString().split('T') (that is the UTC date) and never add 24 h in ms to
// reach the next day (DST days are 23 or 25 h): use calendar arithmetic (addLocalDays).

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i

export const DEFAULT_TIME_ZONE = 'America/Denver'

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatterCache.set(zone, f)
  }
  return f
}

// Wall-clock fields of an instant in `zone` (browser-local when omitted).
export function zonedParts(date: Date, zone?: string): ZonedParts {
  if (!zone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds()
    }
  }
  const out: Record<string, number> = {}
  for (const p of partsFormatter(zone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second
  }
}

// ms to add to UTC to get the wall clock of `zone` at that instant (negative west of Greenwich).
function zoneOffsetMs(ms: number, zone: string): number {
  const p = zonedParts(new Date(ms), zone)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wallAsUtc - Math.floor(ms / 1000) * 1000
}

// The instant at which `zone`'s wall clock reads y-m-d h:mi (month 1-12; day/hour may overflow and roll
// over like Date). DST-safe: a skipped wall time (spring forward) lands after the gap, a repeated one
// (fall back) resolves to its first occurrence.
export function zonedTimeToInstant(
  y: number,
  month: number,
  d: number,
  h: number,
  mi: number,
  zone?: string
): Date {
  if (!zone) return new Date(y, month - 1, d, h, mi)
  const guess = Date.UTC(y, month - 1, d, h, mi)
  const first = guess - zoneOffsetMs(guess, zone)
  const second = guess - zoneOffsetMs(first, zone)
  if (first === second) return new Date(first)
  // Offsets differ at the two guesses: `second` is right unless the wall time does not exist (spring
  // forward), in which case it reads an hour early; then `first` lands just after the gap, like Date.
  const p = zonedParts(new Date(second), zone)
  const wall = Date.UTC(y, month - 1, d, h, mi)
  const back = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return new Date(back === wall ? second : first)
}

const pad = (n: number, width = 2) => n.toString().padStart(width, '0')

export function formatLocalDate(date: Date, zone?: string): string {
  const p = zonedParts(date, zone)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

// "HH:mm" in `zone` (24 h).
export function formatLocalTime(date: Date, zone?: string): string {
  const p = zonedParts(date, zone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

// Midnight of a "YYYY-MM-DD" string in `zone` (new Date('YYYY-MM-DD') would be UTC midnight).
export function parseLocalDate(dateStr: string, zone?: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return zonedTimeToInstant(y, m, d, 0, 0, zone)
}

// "YYYY-MM-DD" shifted by whole calendar days. Pure calendar arithmetic, the same in every zone.
export function addLocalDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

// Day of the week of a "YYYY-MM-DD" date, 0 = Sunday. Zone independent.
export function weekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// UTC instant (ISO string) of 00:00 in `zone` on `dateStr`.
export function localDayStartIso(dateStr: string, zone?: string): string {
  return parseLocalDate(dateStr, zone).toISOString()
}

// UTC instant (ISO string) of 00:00 in `zone` on the day AFTER `dateStr` (exclusive end of that day).
export function localNextDayStartIso(dateStr: string, zone?: string): string {
  return parseLocalDate(addLocalDays(dateStr, 1), zone).toISOString()
}

// Normalizes a timestamp to a UTC ISO string. A value that already carries an offset/Z keeps its instant;
// an offset-less value ("2026-03-10T09:00") is a wall-clock time in `zone` (browser-local when omitted).
export function toInstantIso(value: string, zone?: string): string {
  if (OFFSET_SUFFIX.test(value)) return value
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value)
  if (zone && m) {
    return zonedTimeToInstant(+m[1], +m[2], +m[3], +m[4], +m[5], zone).toISOString()
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

// True for any IANA zone name the runtime knows ("UTC" included).
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

// Short zone name at an instant: "MST", "MDT", "UTC", or "GMT+1" for zones without an English abbreviation.
export function zoneShortName(date: Date, zone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(zone ? { timeZone: zone } : {}),
    timeZoneName: 'short'
  }).formatToParts(date)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone ?? ''
}
