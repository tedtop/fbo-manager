'use client'

import { useMemo } from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { ShiftChip } from './shift-chip'
import type { MemberWithUser } from '@/repositories/departments.repo'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  canEditShiftFor,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

const MAX_CHIPS_PER_DAY = 4
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthViewProps {
  anchor: Date // any date inside the displayed month
  shifts: ScheduleShiftRow[]
  members: MemberWithUser[]
  permission: SchedulePermissionContext
  onEditShift: (shift: ScheduleShiftRow) => void
  /** Clicking a day drills into its week */
  onDayClick: (date: string) => void
}

export function MonthView({
  anchor,
  shifts,
  members,
  permission,
  onEditShift,
  onDayClick,
}: MonthViewProps) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const initialsByUser = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of members) {
      if (m.user) {
        map.set(m.user_id, `${m.user.first_name[0] ?? ''}${m.user.last_name[0] ?? ''}`.toUpperCase())
      }
    }
    return map
  }, [members])

  const weeks = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    const out: Date[][] = []
    let cursor = gridStart
    while (cursor <= gridEnd) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)))
      cursor = addDays(cursor, 7)
    }
    return out
  }, [anchor])

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ScheduleShiftRow[]>()
    for (const s of shifts) {
      const list = map.get(s.shift_date)
      if (list) list.push(s)
      else map.set(s.shift_date, [s])
    }
    return map
  }, [shifts])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const inMonth = isSameMonth(day, anchor)
              const isToday = dateStr === today
              const dayShifts = shiftsByDate.get(dateStr) ?? []
              const visible = dayShifts.slice(0, MAX_CHIPS_PER_DAY)
              const hidden = dayShifts.length - visible.length
              const staffCount = new Set(dayShifts.map((s) => s.user_id)).size

              return (
                <div
                  key={dateStr}
                  role="button"
                  tabIndex={0}
                  onClick={() => onDayClick(dateStr)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onDayClick(dateStr)
                  }}
                  className={cn(
                    'min-h-[6.5rem] cursor-pointer border-l border-border p-1.5 transition-colors first:border-l-0 hover:bg-muted/40',
                    !inMonth && 'bg-muted/20 opacity-50',
                    isToday && 'bg-primary/5'
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium',
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {staffCount > 0 && (
                      <span
                        className={cn(
                          'rounded px-1 text-[9px] font-semibold tabular-nums',
                          staffCount >= 3
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : staffCount === 2
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-red-500/15 text-red-600 dark:text-red-400'
                        )}
                        title={`${staffCount} staff scheduled`}
                      >
                        {staffCount}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {visible.map((s) => {
                      const editable = canEditShiftFor(permission, s.user_id)
                      return (
                        <ShiftChip
                          key={s.id}
                          startTime={s.start_time}
                          endTime={s.end_time}
                          compact
                          prefix={initialsByUser.get(s.user_id) ?? '?'}
                          onClick={
                            editable
                              ? () => onEditShift(s)
                              : undefined
                          }
                          className={editable ? undefined : 'pointer-events-none'}
                        />
                      )
                    })}
                    {hidden > 0 && (
                      <div className="px-1 text-[10px] text-muted-foreground">
                        +{hidden} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
