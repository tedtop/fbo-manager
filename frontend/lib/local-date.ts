// Local-calendar date helpers (BACKLOG B10, docs/PLAN.md F2/F5). A "date string" is "YYYY-MM-DD" in the
// runtime's local zone. Never derive one with toISOString().split('T') (that is the UTC date) and never
// add 24 h in ms to reach the next day (DST days are 23 or 25 h): use local calendar arithmetic.

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

// "HH:mm" in local time.
export function formatLocalTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

// Local midnight of a "YYYY-MM-DD" string (new Date('YYYY-MM-DD') would be UTC midnight).
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// "YYYY-MM-DD" shifted by whole local calendar days.
export function addLocalDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return formatLocalDate(new Date(y, m - 1, d + days))
}

// UTC instant (ISO string) of local 00:00 on `dateStr`.
export function localDayStartIso(dateStr: string): string {
  return parseLocalDate(dateStr).toISOString()
}

// UTC instant (ISO string) of local 00:00 on the day AFTER `dateStr` (exclusive end of that day).
export function localNextDayStartIso(dateStr: string): string {
  return parseLocalDate(addLocalDays(dateStr, 1)).toISOString()
}

// Normalizes a timestamp to a UTC ISO string. A value that already carries an offset/Z keeps its instant;
// an offset-less value ("2026-03-10T09:00") is a local wall-clock time and is converted as such.
export function toInstantIso(value: string): string {
  if (OFFSET_SUFFIX.test(value)) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}
