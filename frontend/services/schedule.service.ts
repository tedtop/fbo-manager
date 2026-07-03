/**
 * Domain logic for department scheduling.
 * Pure functions only — no Supabase, no React. This is the single place
 * permission rules and shift time math live, so future ACL work (per-role,
 * per-department settings) only touches this file and the DB policies.
 */
import type { DepartmentSettings } from '@/types/database'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import type { UserRow } from '@/repositories/users.repo'
import type { MemberWithUser } from '@/repositories/departments.repo'

// ---------- time math ----------

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10)
}

/** Shifts ending at or before their start time cross midnight into the next day. */
export function isOvernight(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) <= timeToMinutes(startTime)
}

export function shiftDurationHours(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime)
  let end = timeToMinutes(endTime)
  if (end <= start) end += 24 * 60
  return (end - start) / 60
}

/** "05:00:00" -> "0500" (matches how line crews write schedules) */
export function formatShiftTime(t: string): string {
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}`
}

export function formatShiftRange(startTime: string, endTime: string): string {
  return `${formatShiftTime(startTime)}–${formatShiftTime(endTime)}`
}

// ---------- shift categories (drives chip colors) ----------

export type ShiftCategory = 'morning' | 'day' | 'swing' | 'night'

export function shiftCategory(startTime: string): ShiftCategory {
  const h = timeToMinutes(startTime) / 60
  if (h >= 4 && h < 9) return 'morning'
  if (h >= 9 && h < 13) return 'day'
  if (h >= 13 && h < 20) return 'swing'
  return 'night'
}

export const SHIFT_CATEGORY_LABELS: Record<ShiftCategory, string> = {
  morning: 'Morning',
  day: 'Day',
  swing: 'Swing',
  night: 'Night',
}

// ---------- weekly hours ----------

/** Total scheduled hours per user for shifts whose shift_date falls in [start, end]. */
export function hoursByUser(
  shifts: ScheduleShiftRow[],
  startDate: string,
  endDate: string
): Map<number, number> {
  const totals = new Map<number, number>()
  for (const s of shifts) {
    if (s.shift_date < startDate || s.shift_date > endDate) continue
    totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + shiftDurationHours(s.start_time, s.end_time))
  }
  return totals
}

// ---------- coverage ----------

/**
 * Headcount for each hour (0-23) of `date`, counting same-day shifts,
 * the pre-midnight portion of overnight shifts starting on `date`, and
 * the post-midnight tail of overnight shifts started the previous day.
 */
export function coverageForDate(shifts: ScheduleShiftRow[], date: string): number[] {
  const counts = new Array<number>(24).fill(0)
  const prevDate = addDaysISO(date, -1)

  for (const s of shifts) {
    const start = timeToMinutes(s.start_time) / 60
    const end = timeToMinutes(s.end_time) / 60
    const overnight = isOvernight(s.start_time, s.end_time)

    if (s.shift_date === date) {
      if (!overnight) {
        for (let h = 0; h < 24; h++) if (h >= start && h < end) counts[h]++
      } else {
        for (let h = 0; h < 24; h++) if (h >= start) counts[h]++
      }
    } else if (s.shift_date === prevDate && overnight) {
      for (let h = 0; h < 24; h++) if (h < end) counts[h]++
    }
  }
  return counts
}

/** Does this shift put the employee on duty at any point during `date`? */
export function shiftTouchesDate(shift: ScheduleShiftRow, date: string): boolean {
  if (shift.shift_date === date) return true
  return (
    isOvernight(shift.start_time, shift.end_time) &&
    shift.shift_date === addDaysISO(date, -1)
  )
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ---------- permissions (ACL seam) ----------

export type SchedulePermissionContext = {
  currentUser: Pick<UserRow, 'id' | 'role'> | null
  membership: MemberWithUser | null // current user's membership in this department
  settings: DepartmentSettings
}

/** May the current user create/edit/delete a shift belonging to `targetUserId`? */
export function canEditShiftFor(
  ctx: SchedulePermissionContext,
  targetUserId: number
): boolean {
  if (!ctx.currentUser) return false
  if (ctx.currentUser.role === 'admin') return true

  const editRoles = ctx.settings.edit_roles ?? ['lead', 'supervisor']
  if (ctx.membership && editRoles.includes(ctx.membership.dept_role)) return true

  const allowSelfEdit = ctx.settings.allow_self_edit ?? true
  return allowSelfEdit && ctx.currentUser.id === targetUserId
}

/** May the current user edit anything at all on this schedule? */
export function canEditAnyShift(ctx: SchedulePermissionContext): boolean {
  if (!ctx.currentUser) return false
  if (ctx.currentUser.role === 'admin') return true
  const editRoles = ctx.settings.edit_roles ?? ['lead', 'supervisor']
  if (ctx.membership && editRoles.includes(ctx.membership.dept_role)) return true
  return (ctx.settings.allow_self_edit ?? true) && !!ctx.membership
}

/** May the current user pick arbitrary employees when creating shifts? */
export function canEditWholeDepartment(ctx: SchedulePermissionContext): boolean {
  if (!ctx.currentUser) return false
  if (ctx.currentUser.role === 'admin') return true
  const editRoles = ctx.settings.edit_roles ?? ['lead', 'supervisor']
  return !!ctx.membership && editRoles.includes(ctx.membership.dept_role)
}
