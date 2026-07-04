'use client'

import { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Moon,
  Pencil,
  Plus,
  Sun,
  Sunrise,
  Sunset,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WeekView } from '@/components/line-schedule/week-view'
import { MonthView } from '@/components/line-schedule/month-view'
import { ShiftDialog } from '@/components/line-schedule/shift-dialog'
import { CoverageLegend } from '@/components/line-schedule/coverage-strip'
import { useDepartment, useDepartments } from '@/hooks/use-department'
import { useSchedule } from '@/hooks/use-schedule'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  canEditAnyShift,
  canEditWholeDepartment,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

type ViewMode = 'week' | 'month'

const CATEGORY_LEGEND = [
  { label: 'Morning', icon: Sunrise, className: 'text-amber-600 dark:text-amber-400' },
  { label: 'Day', icon: Sun, className: 'text-sky-600 dark:text-sky-400' },
  { label: 'Swing', icon: Sunset, className: 'text-violet-600 dark:text-violet-400' },
  { label: 'Night', icon: Moon, className: 'text-indigo-600 dark:text-indigo-400' },
] as const

export default function LineSchedulePage() {
  const [deptSlug, setDeptSlug] = useState('line')
  const [view, setView] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(new Date())

  const { departments } = useDepartments()
  const { department, members, loading: deptLoading } = useDepartment(deptSlug)
  const { user } = useCurrentUser()

  // Visible range (+1 day back so overnight tails from the prior day render)
  const { rangeStart, rangeEnd, weekDays } = useMemo(() => {
    const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
    if (view === 'week') {
      return {
        rangeStart: format(addDays(weekStart, -1), 'yyyy-MM-dd'),
        rangeEnd: format(addDays(weekStart, 6), 'yyyy-MM-dd'),
        weekDays: Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd')),
      }
    }
    const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    return {
      rangeStart: format(addDays(gridStart, -1), 'yyyy-MM-dd'),
      rangeEnd: format(gridEnd, 'yyyy-MM-dd'),
      weekDays: [] as string[],
    }
  }, [anchor, view])

  const {
    shifts,
    loading: shiftsLoading,
    createShift,
    updateShift,
    deleteShift,
  } = useSchedule(department?.id ?? null, rangeStart, rangeEnd)

  const permission: SchedulePermissionContext = useMemo(
    () => ({
      currentUser: user ? { id: user.id, role: user.role } : null,
      membership: members.find((m) => m.user_id === user?.id) ?? null,
      settings: department?.settings ?? {},
    }),
    [user, members, department]
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editShift, setEditShift] = useState<ScheduleShiftRow | null>(null)
  const [dialogDefaults, setDialogDefaults] = useState<{ date?: string; userId?: number }>({})

  function openAdd(date?: string, userId?: number) {
    setEditShift(null)
    setDialogDefaults({ date, userId })
    setDialogOpen(true)
  }

  function openEdit(shift: ScheduleShiftRow) {
    setEditShift(shift)
    setDialogOpen(true)
  }

  function navigate(direction: -1 | 1) {
    setAnchor((a) => (view === 'week' ? addDays(a, direction * 7) : addMonths(a, direction)))
  }

  const rangeLabel =
    view === 'week'
      ? `${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'MMM d')} – ${format(
          endOfWeek(anchor, { weekStartsOn: 1 }),
          'MMM d, yyyy'
        )}`
      : format(anchor, 'MMMM yyyy')

  const editableAny = canEditAnyShift(permission)
  const selfServiceOnly = editableAny && !canEditWholeDepartment(permission)
  const loading = deptLoading || shiftsLoading

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {department && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: department.color }}
                />
              )}
              {department?.name ?? 'Department'} Schedule
            </h1>
            {departments.length > 1 && (
              <Select value={deptSlug} onValueChange={setDeptSlug}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.slug} value={d.slug}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2">
            {editableAny && (
              <Button size="sm" onClick={() => openAdd()}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Shift
              </Button>
            )}
          </div>
        </div>

        {/* Navigation + view toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[12rem] text-center text-sm font-medium tabular-nums">
              {rangeLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setAnchor(new Date())}
            >
              Today
            </Button>
          </div>

          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs">
                Week
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs">
                Month
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Schedule */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !department ? (
          <div className="rounded-xl border border-border py-20 text-center text-sm text-muted-foreground">
            Department “{deptSlug}” not found.
          </div>
        ) : view === 'week' ? (
          <WeekView
            days={weekDays}
            shifts={shifts}
            members={members}
            permission={permission}
            onAddShift={(date, userId) => openAdd(date, userId)}
            onEditShift={openEdit}
          />
        ) : (
          <MonthView
            anchor={anchor}
            shifts={shifts}
            members={members}
            permission={permission}
            onEditShift={openEdit}
            onDayClick={(date) => {
              setAnchor(new Date(`${date}T12:00:00`))
              setView('week')
            }}
          />
        )}

        {/* Legends + hints */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-3">
            <span className="font-medium">Shifts:</span>
            {CATEGORY_LEGEND.map(({ label, icon: Icon, className }) => (
              <span key={label} className="flex items-center gap-1">
                <Icon className={`h-3 w-3 ${className}`} />
                {label}
              </span>
            ))}
          </span>
          {view === 'week' && <CoverageLegend />}
          {selfServiceOnly && (
            <span className="flex items-center gap-1">
              <Pencil className="h-3 w-3" />
              You can edit your own shifts
            </span>
          )}
        </div>
      </div>

      {department && (
        <ShiftDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          departmentId={department.id}
          members={members}
          permission={permission}
          shift={editShift}
          defaultDate={dialogDefaults.date}
          defaultUserId={dialogDefaults.userId}
          onAdd={createShift}
          onUpdate={updateShift}
          onDelete={deleteShift}
        />
      )}
    </div>
  )
}
