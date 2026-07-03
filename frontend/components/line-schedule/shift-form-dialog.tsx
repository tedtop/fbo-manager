'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import type { FuelerRow } from '@/repositories/fuelers.repo'
import type { ShiftInsert, ShiftWithFueler } from '@/repositories/shifts.repo'
import { useEffect, useState } from 'react'

interface ShiftFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift?: ShiftWithFueler | null
  fuelers: FuelerRow[]
  defaultDate?: string
  defaultFuelerId?: number
  onAdd: (data: ShiftInsert) => Promise<unknown>
  onUpdate: (id: number, data: Partial<ShiftInsert>) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
}

const emptyForm = {
  fueler_id: 0,
  shift_date: '',
  start_time: '',
  end_time: ''
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  shift,
  fuelers,
  defaultDate,
  defaultFuelerId,
  onAdd,
  onUpdate,
  onDelete
}: ShiftFormDialogProps) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (shift) {
      setForm({
        fueler_id: shift.fueler_id,
        shift_date: shift.shift_date,
        start_time: shift.start_time.slice(0, 5),
        end_time: shift.end_time.slice(0, 5)
      })
    } else {
      setForm({
        fueler_id: defaultFuelerId ?? fuelers[0]?.id ?? 0,
        shift_date: defaultDate ?? '',
        start_time: '',
        end_time: ''
      })
    }
  }, [shift, open, defaultDate, defaultFuelerId, fuelers])

  const isEdit = !!shift

  async function handleSave() {
    if (
      !form.fueler_id ||
      !form.shift_date ||
      !form.start_time ||
      !form.end_time
    )
      return
    setSaving(true)
    try {
      if (isEdit && shift) {
        await onUpdate(shift.id, form)
      } else {
        await onAdd(form as ShiftInsert)
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!shift) return
    setDeleting(true)
    try {
      await onDelete(shift.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  const isOvernight =
    form.start_time && form.end_time && form.end_time < form.start_time

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{isEdit ? 'Edit Shift' : 'Add Shift'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update or remove this fueler shift.'
              : 'Schedule a new fueler shift.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <Label>Fueler</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.fueler_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, fueler_id: Number(e.target.value) }))
              }
            >
              <option value={0} disabled>
                Select fueler…
              </option>
              {fuelers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fueler_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={form.shift_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, shift_date: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start time</Label>
              <Input
                type="time"
                className="mt-1"
                value={form.start_time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_time: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>End time</Label>
              <Input
                type="time"
                className="mt-1"
                value={form.end_time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, end_time: e.target.value }))
                }
              />
            </div>
          </div>

          {isOvernight && (
            <p className="text-xs text-muted-foreground">
              Overnight shift — ends next calendar day.
            </p>
          )}
        </div>

        <SheetFooter
          className={`flex-col gap-2 border-t border-border p-4 sm:flex-row ${isEdit ? 'sm:justify-between' : 'sm:justify-end'}`}
        >
          {isEdit && (
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button
            className="w-full sm:w-auto"
            onClick={handleSave}
            disabled={
              saving ||
              deleting ||
              !form.fueler_id ||
              !form.shift_date ||
              !form.start_time ||
              !form.end_time
            }
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Shift'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
