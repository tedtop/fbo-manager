// Pure logic behind the board's display zone (docs/PLAN.md B10 notes): the FBO's configured IANA zone, or
// Zulu (UTC) when the per-user toggle is on. The React side is hooks/use-display-zone.ts.

import { formatLocalDate, formatLocalTime, zoneShortName } from '@/lib/local-date'

export const ZULU_STORAGE_KEY = 'fbo.displayZulu'
export const ZULU_ZONE = 'UTC'

// The zone the board reads and writes times in.
export function resolveDisplayZone(fboZone: string, isZulu: boolean): string {
  return isZulu ? ZULU_ZONE : fboZone
}

export function parseStoredZulu(raw: string | null | undefined): boolean {
  return raw === '1'
}

// "Z" in Zulu mode, else the zone's short name at that instant ("MST" in winter, "MDT" in summer).
export function zoneSuffix(date: Date, fboZone: string, isZulu: boolean): string {
  return isZulu ? 'Z' : zoneShortName(date, fboZone)
}

// The card label "MM/DD HH:mm" of a stored instant in `zone` (the display zone, 24 h).
export function formatBoardTimestamp(timestamp: string | undefined, zone: string): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return `${formatLocalDate(d, zone).slice(5).replace('-', '/')} ${formatLocalTime(d, zone)}`
}

// Header text: "Times in MST" / "Times in Zulu (UTC)".
export function zoneBannerText(fboZone: string, isZulu: boolean, now: Date = new Date()): string {
  return isZulu ? 'Times in Zulu (UTC)' : `Times in ${zoneShortName(now, fboZone)}`
}

// Settings picker: the US zones first, then every other zone the runtime knows.
export const US_TIME_ZONES: { zone: string; label: string }[] = [
  { zone: 'America/New_York', label: 'Eastern (New York)' },
  { zone: 'America/Chicago', label: 'Central (Chicago)' },
  { zone: 'America/Denver', label: 'Mountain (Denver)' },
  { zone: 'America/Phoenix', label: 'Mountain, no DST (Phoenix)' },
  { zone: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { zone: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { zone: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' }
]

export function allTimeZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone')
  const common = new Set(US_TIME_ZONES.map((z) => z.zone))
  const rest = (supported ?? []).filter((z) => !common.has(z))
  return ['UTC', ...rest.filter((z) => z !== 'UTC')]
}
