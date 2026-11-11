'use client'

import { useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useAppSettings } from '@/hooks/use-app-settings'
import { formatPersonName } from '@/lib/app-settings'
import { segmentColor } from './coverage-strip'
import type { MemberWithUser } from '@/repositories/departments.repo'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  addDaysISO,
  canEditShiftFor,
  coverageForDate,
  formatShiftRange,
  isOvernight,
  shiftCategory,
  timeToMinutes,
  type ShiftCategory,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

const HOUR_PX = 40
const HOURS = Array.from({ length: 24 }, (_, h) => h)

const BLOCK_STYLES: Record<ShiftCategory, string> = {
  morning: 'border-amber-500/60 bg-amber-500/25 text-amber-800 dark:text-amber-200',
  day: 'border-sky-500/60 bg-sky-500/25 text-sky-800 dark:text-sky-200',
  swing: 'border-violet-500/60 bg-violet-500/25 text-violet-800 dark:text-violet-200',
  night: 'border-indigo-500/60 bg-indigo-500/25 text-indigo-800 dark:text-indigo-200',
}

interface Segment {
  shift: ScheduleShiftRow
  startMin: number // minutes from 00:00 of this column's day
  endMin: number
  tail: boolean // post-midnight part of the previous day's overnight shift
  lane: number
  lanes: number
}

/** Lay out one day's segments in side-by-side lanes (like overlapping calendar events). */
function layoutDay(shifts: ScheduleShiftRow[], date: string): Segment[] {
  const prev = addDaysISO(date, -1)
  const raw: Omit<Segment, 'lane' | 'lanes'>[] = []
  for (const s of shifts) {
    const over = isOvernight(s.start_time, s.end_time)
    if (s.shift_date === date) {
      raw.push({
        shift: s,
        startMin: timeToMinutes(s.start_time),
        endMin: over ? 24 * 60 : timeToMinutes(s.end_time),
        tail: false,
      })
    } else if (s.shift_date === prev && over) {
      raw.push({ shift: s, startMin: 0, endMin: timeToMinutes(s.end_time), tail: true })
    }
  }
  raw.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const laneEnds: number[] = []
  const placed: Segment[] = raw.map((seg) => {
    let lane = laneEnds.findIndex((end) => end <= seg.startMin)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = seg.endMin
    return { ...seg, lane, lanes: lane + 1 }
  })
  // Blocks that overlap in time share the widest lane count among them.
  for (let pass = 0; pass < 3; pass++) {
    for (const seg of placed) {
      for (const o of placed) {
        if (o.startMin < seg.endMin && o.endMin > seg.startMin && o.lanes > seg.lanes) {
          seg.lanes = o.lanes
        }
      }
    }
  }
  return placed
}

interface HourlyViewProps {
  days: string[] // 7 ISO dates, Monday first
  shifts: ScheduleShiftRow[] // includes the day before days[0] for overnight tails
  members: MemberWithUser[]
  permission: SchedulePermissionContext
  onEditShift: (shift: ScheduleShiftRow) => void
}

/** Google-Calendar-style week: 24 hour rows × 7 day columns, shifts as time blocks, coverage per hour. */
export function HourlyView({ days, shifts, members, permission, onEditShift }: HourlyViewProps) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { settings: { nameDisplay } } = useAppSettings()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 4 * HOUR_PX })
  }, [])

  const nameByUser = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of members) {
      if (m.user) map.set(m.user_id, formatPersonName(m.user.first_name, m.user.last_name, nameDisplay))
    }
    return map
  }, [members, nameDisplay])

  const columns = useMemo(
    () =>
      days.map((d) => ({
        date: d,
        coverage: coverageForDate(shifts, d),
        segments: layoutDay(shifts, d),
      })),
    [shifts, days]
  )

  const now = new Date()
  const nowPx = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX

  return (
    <div className="rounded-xl border border-border bg-card">
      <div ref={scrollRef} className="max-h-[calc(100vh-14rem)] min-h-[24rem] overflow-auto">
        <div className="min-w-[56rem]">
          {/* Sticky day headers */}
          <div className="sticky top-0 z-30 grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border bg-card">
            <div />
            {columns.map(({ date, segments }) => {
              const isToday = date === today
              const count = new Set(segments.map((s) => s.shift.user_id)).size
              return (
                <div
                  key={date}
                  className={cn('border-l border-border px-2 py-2 text-center', isToday && 'bg-primary/5')}
                >
                  <div className={cn('text-xs font-semibold', isToday && 'text-primary')}>
                    {format(new Date(`${date}T12:00:00`), 'EEE d')}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{count} on duty</div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]">
            {/* Hour gutter */}
            <div>
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{ height: HOUR_PX }}
                  className="relative pr-2 text-right text-[10px] tabular-nums text-muted-foreground"
                >
                  <span className="relative -top-1.5">{String(h).padStart(2, '0')}00</span>
                </div>
              ))}
            </div>

            {columns.map(({ date, coverage, segments }) => {
              const isToday = date === today
              return (
                <div
                  key={date}
                  className={cn('relative border-l border-border', isToday && 'bg-primary/5')}
                  style={{ height: HOUR_PX * 24 }}
                >
                  {/* hour lines + coverage strip (hover for headcount) */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      style={{ top: h * HOUR_PX, height: HOUR_PX }}
                      className="absolute inset-x-0 border-t border-border/60"
                      title={`${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00 · ${coverage[h]} on duty`}
                    >
                      <div className={cn('absolute inset-y-0 left-0 w-1', segmentColor(coverage[h]))} />
                    </div>
                  ))}

                  {/* shift blocks */}
                  {segments.map((seg) => {
                    const s = seg.shift
                    const editable = canEditShiftFor(permission, s.user_id)
                    const name = nameByUser.get(s.user_id) ?? '?'
                    const widthPct = 100 / seg.lanes
                    const narrow = seg.lanes >= 4
                    return (
                      <button
                        key={`${s.id}-${seg.tail ? 't' : 'o'}`}
                        type="button"
                        disabled={!editable}
                        onClick={() => onEditShift(s)}
                        title={`${name} · ${formatShiftRange(s.start_time, s.end_time)}${seg.tail ? ' (from previous day)' : ''}`}
                        className={cn(
                          'absolute z-10 overflow-hidden rounded-md border px-1 py-0.5 text-left text-[10px] font-semibold leading-tight transition-colors hover:brightness-110',
                          BLOCK_STYLES[shiftCategory(s.start_time)],
                          seg.tail && 'border-dashed opacity-70',
                          !editable && 'cursor-default'
                        )}
                        style={{
                          top: (seg.startMin / 60) * HOUR_PX + 1,
                          height: ((seg.endMin - seg.startMin) / 60) * HOUR_PX - 2,
                          left: `calc(${seg.lane * widthPct}% + 6px)`,
                          width: `calc(${widthPct}% - 3px)`,
                          writingMode: narrow ? 'vertical-rl' : undefined,
                        }}
                      >
                        <span className="block truncate">{name}</span>
                        {!narrow && (
                          <span className="block truncate font-normal tabular-nums opacity-80">
                            {formatShiftRange(s.start_time, s.end_time)}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {isToday && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                      style={{ top: nowPx }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
