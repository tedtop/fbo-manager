'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Moon, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MemberWithUser } from '@/repositories/departments.repo'
import type { ScheduleShiftInsert, ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  canEditShiftFor,
  canEditWholeDepartment,
  isOvernight,
  shiftDurationHours,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

const PRESETS: Array<{ label: string; start: string; end: string }> = [
  { label: '0500–1500', start: '05:00', end: '15:00' },
  { label: '0600–1600', start: '06:00', end: '16:00' },
  { label: '0800–1800', start: '08:00', end: '18:00' },
  { label: '1000–2000', start: '10:00', end: '20:00' },
  { label: '1200–2200', start: '12:00', end: '22:00' },
  { label: '1400–2100', start: '14:00', end: '21:00' },
  { label: '2200–0800', start: '22:00', end: '08:00' },
]

interface ShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentId: number
  members: MemberWithUser[]
  permission: SchedulePermissionContext
  /** Existing shift → edit mode; null → create mode */
  shift: ScheduleShiftRow | null
  defaultDate?: string
  defaultUserId?: number
  onAdd: (shift: ScheduleShiftInsert) => Promise<unknown>
  onUpdate: (id: number, updates: Partial<ScheduleShiftInsert>) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
}

export function ShiftDialog({
  open,
  onOpenChange,
  departmentId,
  members,
  permission,
  shift,
  defaultDate,
  defaultUserId,
  onAdd,
  onUpdate,
  onDelete,
}: ShiftDialogProps) {
  const currentUserId = permission.currentUser?.id
  const wholeDept = canEditWholeDepartment(permission)

  // Members the current user is allowed to schedule for
  const eligibleMembers = useMemo(
    () => members.filter((m) => canEditShiftFor(permission, m.user_id)),
    [members, permission]
  )

  const [userId, setUserId] = useState<number | undefined>(undefined)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setConfirmDelete(false)
    if (shift) {
      setUserId(shift.user_id)
      setDate(shift.shift_date)
      setStart(shift.start_time.slice(0, 5))
      setEnd(shift.end_time.slice(0, 5))
      setNotes(shift.notes ?? '')
    } else {
      setUserId(defaultUserId ?? (wholeDept ? eligibleMembers[0]?.user_id : currentUserId))
      setDate(defaultDate ?? format(new Date(), 'yyyy-MM-dd'))
      setStart('')
      setEnd('')
      setNotes('')
    }
  }, [open, shift, defaultDate, defaultUserId, wholeDept, currentUserId, eligibleMembers])

  const overnight = start && end ? isOvernight(start, end) : false
  const duration = start && end ? shiftDurationHours(start, end) : 0

  async function handleSave() {
    if (!userId || !date || !start || !end) {
      setError('Employee, date, start and end times are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (shift) {
        await onUpdate(shift.id, {
          user_id: userId,
          shift_date: date,
          start_time: start,
          end_time: end,
          notes,
          updated_by: currentUserId ?? null,
        })
      } else {
        await onAdd({
          department_id: departmentId,
          user_id: userId,
          shift_date: date,
          start_time: start,
          end_time: end,
          notes,
          created_by: currentUserId ?? null,
        })
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save shift.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!shift) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await onDelete(shift.id)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete shift.')
    } finally {
      setBusy(false)
    }
  }

  const canDelete = shift ? canEditShiftFor(permission, shift.user_id) : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{shift ? 'Edit Shift' : 'Add Shift'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select
              value={userId !== undefined ? String(userId) : undefined}
              onValueChange={(v) => setUserId(Number(v))}
              disabled={eligibleMembers.length <= 1}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {eligibleMembers.map((m) => (
                  <SelectItem key={m.user_id} value={String(m.user_id)}>
                    {m.user ? `${m.user.first_name} ${m.user.last_name}` : `User #${m.user_id}`}
                    {m.user_id === currentUserId ? ' (you)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-date">Date</Label>
            <Input
              id="shift-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Quick presets</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const active = start === p.start && end === p.end
                return (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="h-7 px-2 font-mono text-xs tabular-nums"
                    onClick={() => {
                      setStart(p.start)
                      setEnd(p.end)
                    }}
                  >
                    {p.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shift-start">Start</Label>
              <Input
                id="shift-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shift-end">End</Label>
              <Input
                id="shift-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {start && end && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {overnight && <Moon className="h-3.5 w-3.5" />}
              {Number.isInteger(duration) ? duration : duration.toFixed(1)} hour shift
              {overnight && ' — crosses midnight into the next day'}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="shift-notes">Notes</Label>
            <Textarea
              id="shift-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — e.g. covering for Jake"
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <div>
              {shift && canDelete && (
                <Button
                  type="button"
                  variant={confirmDelete ? 'destructive' : 'ghost'}
                  size="sm"
                  onClick={handleDelete}
                  disabled={busy}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {confirmDelete ? 'Confirm delete' : 'Delete'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy}>
                {busy ? 'Saving…' : shift ? 'Save changes' : 'Add shift'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
