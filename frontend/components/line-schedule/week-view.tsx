'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ShiftChip } from './shift-chip'
import { CoverageStrip } from './coverage-strip'
import type { MemberWithUser } from '@/repositories/departments.repo'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  addDaysISO,
  canEditShiftFor,
  coverageForDate,
  hoursByUser,
  isOvernight,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

const ROLE_LABELS: Record<string, string> = {
  lead: 'Lead',
  supervisor: 'Supervisor',
}

function memberInitials(m: MemberWithUser): string {
  if (!m.user) return '?'
  return `${m.user.first_name[0] ?? ''}${m.user.last_name[0] ?? ''}`.toUpperCase()
}

/** Deterministic per-employee accent color */
function memberHue(userId: number): number {
  return Math.round((userId * 137.508) % 360)
}

interface WeekViewProps {
  days: string[] // 7 ISO dates, Monday first
  shifts: ScheduleShiftRow[] // includes day before days[0] for overnight tails
  members: MemberWithUser[]
  permission: SchedulePermissionContext
  onAddShift: (date: string, userId: number) => void
  onEditShift: (shift: ScheduleShiftRow) => void
}

export function WeekView({
  days,
  shifts,
  members,
  permission,
  onAddShift,
  onEditShift,
}: WeekViewProps) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const currentUserId = permission.currentUser?.id

  const weekHours = useMemo(
    () => hoursByUser(shifts, days[0], days[6]),
    [shifts, days]
  )

  const coverageByDay = useMemo(
    () => new Map(days.map((d) => [d, coverageForDate(shifts, d)])),
    [shifts, days]
  )

  const shiftsByUserDay = useMemo(() => {
    const map = new Map<string, ScheduleShiftRow[]>()
    for (const s of shifts) {
      const key = `${s.user_id}:${s.shift_date}`
      const list = map.get(key)
      if (list) list.push(s)
      else map.set(key, [s])
    }
    return map
  }, [shifts])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[64rem]">
        {/* Day headers */}
        <div className="grid grid-cols-[13rem_repeat(7,1fr)] border-b border-border">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
            {members.length} employees
          </div>
          {days.map((d) => {
            const isToday = d === today
            const onDuty = new Set(
              shifts
                .filter(
                  (s) =>
                    s.shift_date === d ||
                    (s.shift_date === addDaysISO(d, -1) && isOvernight(s.start_time, s.end_time))
                )
                .map((s) => s.user_id)
            ).size
            return (
              <div
                key={d}
                className={cn(
                  'border-l border-border px-2 py-2 text-center',
                  isToday && 'bg-primary/5'
                )}
              >
                <div
                  className={cn(
                    'text-xs font-semibold',
                    isToday ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {format(new Date(`${d}T12:00:00`), 'EEE d')}
                  {isToday && (
                    <span className="ml-1 rounded-full bg-primary px-1.5 py-px text-[9px] font-bold uppercase text-primary-foreground">
                      today
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {onDuty} on duty
                </div>
              </div>
            )
          })}
        </div>

        {/* Coverage heatmap row */}
        <div className="grid grid-cols-[13rem_repeat(7,1fr)] border-b border-border bg-muted/30">
          <div className="flex items-center px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            24h coverage
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                'flex items-center border-l border-border px-2 py-1.5',
                d === today && 'bg-primary/5'
              )}
            >
              <CoverageStrip coverage={coverageByDay.get(d) ?? []} />
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {members.map((member) => {
          const isSelf = member.user_id === currentUserId
          const editable = canEditShiftFor(permission, member.user_id)
          const hours = weekHours.get(member.user_id) ?? 0
          const target = member.target_weekly_hours
          const hue = memberHue(member.user_id)
          const hoursTone =
            target == null
              ? 'text-muted-foreground'
              : hours > target
                ? 'text-orange-500 dark:text-orange-400'
                : hours === target
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground'

          return (
            <div
              key={member.id}
              className={cn(
                'grid grid-cols-[13rem_repeat(7,1fr)] border-b border-border last:border-b-0',
                isSelf && 'bg-primary/[0.03]'
              )}
            >
              {/* Employee cell */}
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: `hsl(${hue} 60% 45% / 0.2)`,
                    color: `hsl(${hue} 70% 60%)`,
                  }}
                >
                  {memberInitials(member)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {member.user
                        ? `${member.user.first_name} ${member.user.last_name}`
                        : `User #${member.user_id}`}
                    </span>
                    {isSelf && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        you
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {ROLE_LABELS[member.dept_role] && (
                      <span className="font-medium text-foreground/70">
                        {ROLE_LABELS[member.dept_role]}
                      </span>
                    )}
                    <span className={cn('tabular-nums', hoursTone)}>
                      {Number.isInteger(hours) ? hours : hours.toFixed(1)}
                      {target != null && ` / ${target}`}h
                    </span>
                  </div>
                </div>
              </div>

              {/* Day cells */}
              {days.map((d) => {
                const own = shiftsByUserDay.get(`${member.user_id}:${d}`) ?? []
                const tails = (shiftsByUserDay.get(`${member.user_id}:${addDaysISO(d, -1)}`) ?? []).filter(
                  (s) => isOvernight(s.start_time, s.end_time)
                )
                return (
                  <div
                    key={d}
                    className={cn(
                      'group relative flex min-h-[3.25rem] flex-col justify-center gap-1 border-l border-border p-1',
                      d === today && 'bg-primary/5'
                    )}
                  >
                    {tails.map((s) => (
                      <ShiftChip
                        key={`tail-${s.id}`}
                        startTime={s.start_time}
                        endTime={s.end_time}
                        continuation
                        onClick={editable ? () => onEditShift(s) : undefined}
                      />
                    ))}
                    {own.map((s) => (
                      <ShiftChip
                        key={s.id}
                        startTime={s.start_time}
                        endTime={s.end_time}
                        onClick={editable ? () => onEditShift(s) : undefined}
                      />
                    ))}
                    {editable && own.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onAddShift(d, member.user_id)}
                        className="absolute inset-1 flex items-center justify-center rounded-md border border-dashed border-transparent text-muted-foreground/0 transition-colors hover:border-border hover:bg-muted/40 hover:text-muted-foreground group-hover:text-muted-foreground/40"
                        aria-label={`Add shift for ${member.user?.first_name ?? 'employee'} on ${d}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
