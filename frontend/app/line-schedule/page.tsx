'use client'

import { useState, useMemo } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ShiftGrid } from '@/components/line-schedule/shift-grid'
import { ShiftFormDialog } from '@/components/line-schedule/shift-form-dialog'
import { useShifts } from '@/hooks/use-shifts'
import { useFuelers } from '@/hooks/use-fuelers'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { ShiftWithFueler } from '@/repositories/shifts.repo'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export default function LineSchedulePage() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  const [selectedDate, setSelectedDate] = useState<string>(today)

  function prevWeek() {
    const newStart = addDays(weekStart, -7)
    setWeekStart(newStart)
    const idx = weekDays.findIndex((d) => format(d, 'yyyy-MM-dd') === selectedDate)
    setSelectedDate(format(addDays(newStart, idx >= 0 ? idx : 0), 'yyyy-MM-dd'))
  }

  function nextWeek() {
    const newStart = addDays(weekStart, 7)
    setWeekStart(newStart)
    const idx = weekDays.findIndex((d) => format(d, 'yyyy-MM-dd') === selectedDate)
    setSelectedDate(format(addDays(newStart, idx >= 0 ? idx : 0), 'yyyy-MM-dd'))
  }

  // Fetch one extra day before the week to catch prev-day overnight shifts
  const fetchStart = format(addDays(weekStart, -1), 'yyyy-MM-dd')
  const fetchEnd = format(addDays(weekStart, 6), 'yyyy-MM-dd')

  const { shifts, loading, createShift, updateShift, deleteShift } = useShifts(fetchStart, fetchEnd)
  const { fuelers } = useFuelers(true)
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  const [formOpen, setFormOpen] = useState(false)
  const [editShift, setEditShift] = useState<ShiftWithFueler | null>(null)

  function openAdd() {
    setEditShift(null)
    setFormOpen(true)
  }

  function openEdit(s: ShiftWithFueler) {
    setEditShift(s)
    setFormOpen(true)
  }

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold tracking-tight">Line Schedule</h1>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Shift
            </Button>
          )}
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[13rem] text-center text-sm font-medium">{weekLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1">
          {weekDays.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const isSelected = dateStr === selectedDate
            const isToday = dateStr === today
            const dayShiftCount = shifts.filter((s) => s.shift_date === dateStr).length

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={cn(
                  'flex min-w-[3.25rem] flex-1 flex-col items-center rounded-lg px-1 py-1.5 text-xs transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span className="font-medium">{DAY_LABELS[i]}</span>
                <span
                  className={cn(
                    'text-[11px]',
                    isToday && !isSelected && 'font-bold text-blue-400'
                  )}
                >
                  {format(day, 'd')}
                </span>
                <span
                  className={cn(
                    'mt-0.5 h-1 w-1 rounded-full',
                    dayShiftCount > 0
                      ? isSelected ? 'bg-primary-foreground' : 'bg-blue-400'
                      : 'bg-transparent'
                  )}
                />
              </button>
            )
          })}
        </div>

        {/* Heatmap */}
        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            Loading shifts…
          </div>
        ) : (
          <ShiftGrid
            shifts={shifts}
            fuelers={fuelers}
            displayDate={selectedDate}
            isAdmin={isAdmin}
            onEditShift={openEdit}
            onAddShift={openAdd}
          />
        )}
      </div>

      <ShiftFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        shift={editShift}
        fuelers={fuelers}
        defaultDate={selectedDate}
        onAdd={createShift}
        onUpdate={updateShift}
        onDelete={deleteShift}
      />
    </div>
  )
}
