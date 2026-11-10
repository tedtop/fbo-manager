'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useAppSettings } from '@/hooks/use-app-settings'
import { formatPersonName } from '@/lib/app-settings'
import { ShiftChip } from './shift-chip'
import type { MemberWithUser } from '@/repositories/departments.repo'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  addDaysISO,
  canEditShiftFor,
  isOvernight,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

interface RosterViewProps {
  days: string[] // 7 ISO dates, Monday first
  shifts: ScheduleShiftRow[] // includes the day before days[0] for overnight tails
  members: MemberWithUser[]
  permission: SchedulePermissionContext
  onEditShift: (shift: ScheduleShiftRow) => void
}

/** Day-by-day roster: one column per day listing who is working and when. */
export function RosterView({ days, shifts, members, permission, onEditShift }: RosterViewProps) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { settings: { nameDisplay } } = useAppSettings()

  const nameByUser = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of members) {
      if (m.user) map.set(m.user_id, formatPersonName(m.user.first_name, m.user.last_name, nameDisplay))
    }
    return map
  }, [members, nameDisplay])

  const byDay = useMemo(() => {
    const sort = (a: ScheduleShiftRow, b: ScheduleShiftRow) => a.start_time.localeCompare(b.start_time)
    return new Map(
      days.map((d) => {
        const own = shifts.filter((s) => s.shift_date === d).sort(sort)
        const tails = shifts.filter(
          (s) => s.shift_date === addDaysISO(d, -1) && isOvernight(s.start_time, s.end_time)
        )
        return [d, { own, tails }] as const
      })
    )
  }, [shifts, days])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="grid min-w-[56rem] grid-cols-7">
        {days.map((d) => {
          const { own, tails } = byDay.get(d)!
          const isToday = d === today
          const count = new Set(own.map((s) => s.user_id)).size
          return (
            <div
              key={d}
              className={cn('border-l border-border first:border-l-0', isToday && 'bg-primary/5')}
            >
              <div className="border-b border-border bg-muted/30 px-2 py-2 text-center">
                <div className={cn('text-xs font-semibold', isToday && 'text-primary')}>
                  {format(new Date(`${d}T12:00:00`), 'EEE d')}
                </div>
                <div className="text-[10px] text-muted-foreground">{count} on shift</div>
              </div>
              <div className="min-h-[12rem] space-y-1 p-1.5">
                {tails.map((s) => (
                  <ShiftChip
                    key={`tail-${s.id}`}
                    continuation
                    startTime={s.start_time}
                    endTime={s.end_time}
                    prefix={nameByUser.get(s.user_id) ?? '?'}
                  />
                ))}
                {own.map((s) => {
                  const editable = canEditShiftFor(permission, s.user_id)
                  return (
                    <ShiftChip
                      key={s.id}
                      compact
                      showRange
                      startTime={s.start_time}
                      endTime={s.end_time}
                      prefix={nameByUser.get(s.user_id) ?? '?'}
                      onClick={editable ? () => onEditShift(s) : undefined}
                      className={cn('py-0.5 text-[11px]', !editable && 'pointer-events-none')}
                    />
                  )
                })}
                {own.length === 0 && tails.length === 0 && (
                  <div className="pt-4 text-center text-[11px] text-muted-foreground">No one scheduled</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
