// Wall-clock time in an IANA zone -> UTC instant + ISO string with that zone's offset (BACKLOG B10: flights are
// sent as ISO with offset). Uses Intl only, so it does not depend on the process TZ and needs no library.

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** Offset of `timeZone` from UTC at the given instant, in minutes (Phoenix: -420; New York in July: -240). */
export function tzOffsetMinutes(instantMs: number, timeZone: string): number {
  const p: Record<string, number> = {}
  for (const part of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((wallAsUtc - Math.floor(instantMs / 1000) * 1000) / 60000)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function offsetString(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

export interface ZonedInstant {
  instantMs: number
  /** "YYYY-MM-DDTHH:mm:ss-07:00": the wall time of the resolved instant with its offset. */
  iso: string
  /** ok: unique. ambiguous: clocks go back, the time occurs twice (earlier used). nonexistent: spring-forward gap (shifted forward). */
  status: 'ok' | 'ambiguous' | 'nonexistent'
}

/** `date` "YYYY-MM-DD", `time` "HH:mm", both already validated. Mirrors JS Date semantics for gaps (02:30 -> 03:30) and overlaps (first occurrence). */
export function zonedWallTimeToInstant(date: string, time: string, timeZone: string): ZonedInstant {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi)
  const day = 24 * 60 * 60 * 1000
  const before = tzOffsetMinutes(wallAsUtc - day, timeZone)
  const after = tzOffsetMinutes(wallAsUtc + day, timeZone)

  // An offset is valid for this wall time if the instant it implies really has that offset.
  const valid = [...new Set([before, after])].filter(
    (off) => tzOffsetMinutes(wallAsUtc - off * 60000, timeZone) === off
  )

  let off: number
  let status: ZonedInstant['status'] = 'ok'
  if (valid.length === 0) {
    off = before // gap: apply the pre-transition offset, which lands an hour later on the wall clock
    status = 'nonexistent'
  } else if (valid.length === 1) {
    off = valid[0]
  } else {
    off = Math.max(...valid) // larger offset = earlier instant = first occurrence
    status = 'ambiguous'
  }

  const instantMs = wallAsUtc - off * 60000
  const resolvedOffset = tzOffsetMinutes(instantMs, timeZone)
  const wall = new Date(instantMs + resolvedOffset * 60000).toISOString().slice(0, 19)
  return { instantMs, iso: `${wall}${offsetString(resolvedOffset)}`, status }
}

/** "YYYY-MM-DD" shifted by whole calendar days (pure calendar arithmetic, independent of the process TZ). */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
