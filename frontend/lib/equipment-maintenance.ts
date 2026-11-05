import { toInstantIso, zonedParts } from '@/lib/local-date'

export interface MaintenanceItemLike {
  status: 'open' | 'resolved'
  noted_at: string
  id: number
}

const pad = (n: number) => n.toString().padStart(2, '0')

/** Value for a datetime-local input showing `iso` on the wall clock of `zone` ("2026-11-05T02:00"). */
export function instantToWallClock(iso: string, zone: string): string {
  const p = zonedParts(new Date(iso), zone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** The instant (UTC ISO) at which `zone`'s wall clock reads `wallClock` ("2026-11-05T02:00" from a datetime-local input). */
export function wallClockToInstant(wallClock: string, zone: string): string {
  return toInstantIso(wallClock, zone)
}

/** Open items first, then resolved; inside each group newest `noted_at` first (id breaks ties, newest first). */
export function sortMaintenanceItems<T extends MaintenanceItemLike>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    const byTime = Date.parse(b.noted_at) - Date.parse(a.noted_at)
    return byTime !== 0 ? byTime : b.id - a.id
  })
}
