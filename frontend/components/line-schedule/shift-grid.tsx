'use client'

import { useMemo, useState } from 'react'
import { ShiftCell } from './shift-cell'
import { ShiftPopover } from './shift-popover'
import type { ShiftWithFueler } from '@/repositories/shifts.repo'
import type { FuelerRow } from '@/repositories/fuelers.repo'

export const HOUR_SLOTS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1] as const

function formatHourLabel(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

function timeToMinutes(t: string): number {
  const parts = t.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

function shiftCoversSlot(shift: ShiftWithFueler, hour: number, displayDate: string): boolean {
  const startMin = timeToMinutes(shift.start_time)
  const endMin = timeToMinutes(shift.end_time)
  const isOvernight = endMin < startMin
  const slotMin = hour * 60

  if (!isOvernight) {
    if (shift.shift_date !== displayDate) return false
    return slotMin >= startMin && slotMin < endMin
  }

  // Overnight shift: starts on shift_date, crosses midnight
  if (shift.shift_date === displayDate) {
    // Before-midnight portion (hour >= 6 in our slots) OR
    // After-midnight portion shown at end of this display day (hour 0, 1)
    return slotMin >= startMin || (hour < 6 && slotMin < endMin)
  }

  // Previous calendar day's overnight shift extending into morning of displayDate
  const shiftDate = new Date(shift.shift_date + 'T12:00:00Z')
  const dispDate = new Date(displayDate + 'T12:00:00Z')
  const diffDays = Math.round((dispDate.getTime() - shiftDate.getTime()) / 86400000)
  if (diffDays === 1 && hour >= 6) {
    return slotMin < endMin
  }

  return false
}

interface ShiftGridProps {
  shifts: ShiftWithFueler[]
  fuelers: FuelerRow[]
  displayDate: string
  isAdmin: boolean
  onEditShift: (shift: ShiftWithFueler) => void
  onAddShift: () => void
}

export function ShiftGrid({
  shifts,
  fuelers,
  displayDate,
  isAdmin,
  onEditShift,
  onAddShift,
}: ShiftGridProps) {
  const [popoverHour, setPopoverHour] = useState<number | null>(null)

  const coverageByHour = useMemo(() => {
    const map = new Map<number, ShiftWithFueler[]>()
    for (const hour of HOUR_SLOTS) {
      map.set(hour, shifts.filter((s) => shiftCoversSlot(s, hour, displayDate)))
    }
    return map
  }, [shifts, displayDate])

  const shiftsByFueler = useMemo(() => {
    const map = new Map<number, ShiftWithFueler[]>()
    for (const f of fuelers) {
      map.set(f.id, shifts.filter((s) => s.fueler_id === f.id))
    }
    return map
  }, [shifts, fuelers])

  const coveringShifts = popoverHour !== null ? (coverageByHour.get(popoverHour) ?? []) : []

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 w-28 min-w-[7rem] px-3 py-2 text-left font-medium text-muted-foreground">
                Fueler
              </th>
              {HOUR_SLOTS.map((h) => {
                const count = coverageByHour.get(h)?.length ?? 0
                const labelColor =
                  count === 0 ? 'text-muted-foreground' :
                  count === 1 ? 'text-red-400' :
                  count === 2 ? 'text-yellow-400' :
                  'text-green-400'
                return (
                  <th
                    key={h}
                    className={`w-9 min-w-[2.25rem] py-2 text-center font-medium ${labelColor}`}
                  >
                    {formatHourLabel(h)}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fuelers.length === 0 ? (
              <tr>
                <td
                  colSpan={HOUR_SLOTS.length + 1}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  No active fuelers found.
                </td>
              </tr>
            ) : (
              fuelers.map((fueler) => {
                const fuelerShifts = shiftsByFueler.get(fueler.id) ?? []
                return (
                  <tr key={fueler.id}>
                    <td className="sticky left-0 z-10 bg-background px-3 py-1 font-medium text-sm truncate max-w-[7rem] border-r border-border">
                      {fueler.fueler_name}
                    </td>
                    {HOUR_SLOTS.map((h) => {
                      const count = coverageByHour.get(h)?.length ?? 0
                      const covered = fuelerShifts.some((s) => shiftCoversSlot(s, h, displayDate))
                      return (
                        <td key={h} className="p-0.5">
                          <ShiftCell
                            count={count}
                            covered={covered}
                            onClick={() => setPopoverHour(h)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Coverage:</span>
        {(
          [
            { label: '0 fuelers', color: 'bg-neutral-800' },
            { label: '1 fueler', color: 'bg-red-900/70' },
            { label: '2 fuelers', color: 'bg-yellow-900/70' },
            { label: '3+ fuelers', color: 'bg-green-900/70' },
          ] as const
        ).map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded-sm ${color}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-3 w-5 items-center justify-center rounded-sm bg-neutral-800">
            <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          </span>
          scheduled
        </span>
      </div>

      <ShiftPopover
        open={popoverHour !== null}
        onOpenChange={(open) => { if (!open) setPopoverHour(null) }}
        hour={popoverHour ?? 0}
        displayDate={displayDate}
        coveringShifts={coveringShifts}
        isAdmin={isAdmin}
        onEditShift={onEditShift}
        onAddShift={onAddShift}
      />
    </>
  )
}
