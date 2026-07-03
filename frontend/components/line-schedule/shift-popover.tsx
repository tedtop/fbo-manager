'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Pencil, Plus } from 'lucide-react'
import type { ShiftWithFueler } from '@/repositories/shifts.repo'

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

function formatTime(t: string): string {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const suffix = hour < 12 ? 'AM' : 'PM'
  const displayH = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${displayH}:${m} ${suffix}`
}

interface ShiftPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hour: number
  displayDate: string
  coveringShifts: ShiftWithFueler[]
  isAdmin: boolean
  onEditShift: (shift: ShiftWithFueler) => void
  onAddShift: () => void
}

export function ShiftPopover({
  open,
  onOpenChange,
  hour,
  displayDate,
  coveringShifts,
  isAdmin,
  onEditShift,
  onAddShift,
}: ShiftPopoverProps) {
  const dateLabel = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {formatHour(hour)} · {dateLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          {coveringShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              No fuelers scheduled this hour.
            </p>
          ) : (
            coveringShifts.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{s.fueler?.fueler_name ?? `Fueler ${s.fueler_id}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    {s.end_time < s.start_time ? ' (overnight)' : ''}
                  </p>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      onOpenChange(false)
                      onEditShift(s)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {isAdmin && (
          <Button
            className="mt-2 w-full"
            size="sm"
            onClick={() => {
              onOpenChange(false)
              onAddShift()
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Shift
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
