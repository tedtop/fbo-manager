'use client'

import {
  EQUIPMENT_TYPES,
  formatTypeLabel
} from '@/components/equipment/equipment-status-card'
import { EditSessionStatus } from '@/components/shared/edit-session-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useRecordEditSession } from '@/hooks/use-record-edit-session'
import type {
  EquipmentInsert,
  EquipmentRow
} from '@/repositories/equipment.repo'
import type { EquipmentDomain } from '@/types/domain/equipment'
import { useEffect, useState } from 'react'

interface EquipmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment?: EquipmentDomain | null
  onSubmit: (
    data: EquipmentInsert,
    expectedModifiedAt?: string
  ) => Promise<void>
}

type EquipmentType = EquipmentInsert['equipment_type']
type EquipmentStatus = NonNullable<EquipmentInsert['status']>

const emptyForm: EquipmentInsert = {
  equipment_id: '',
  equipment_name: '',
  equipment_type: 'fuel_truck',
  manufacturer: '',
  model: '',
  serial_number: '',
  status: 'available',
  location: '',
  notes: '',
  last_maintenance_date: null,
  next_maintenance_date: null
}

export function EquipmentFormDialog({
  open,
  onOpenChange,
  equipment,
  onSubmit
}: EquipmentFormDialogProps) {
  const [form, setForm] = useState<EquipmentInsert>(emptyForm)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (equipment) {
      setForm({
        equipment_id: equipment.equipment_id,
        equipment_name: equipment.equipment_name,
        equipment_type: equipment.equipment_type,
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        serial_number: equipment.serial_number,
        status: equipment.status,
        location: equipment.location,
        notes: equipment.notes,
        last_maintenance_date: equipment.last_maintenance_date,
        next_maintenance_date: equipment.next_maintenance_date
      })
    } else {
      setForm(emptyForm)
    }
  }, [equipment, open])

  const updateField = <K extends keyof EquipmentInsert>(
    key: K,
    value: EquipmentInsert[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const editSession = useRecordEditSession<EquipmentRow>({
    table: 'equipment',
    recordId: equipment?.id ?? null,
    modifiedAt: equipment?.modified_at ?? null,
    enabled: open && !!equipment,
    onReload: (freshRow) => {
      setForm({
        equipment_id: freshRow.equipment_id,
        equipment_name: freshRow.equipment_name,
        equipment_type: freshRow.equipment_type,
        manufacturer: freshRow.manufacturer,
        model: freshRow.model,
        serial_number: freshRow.serial_number,
        status: freshRow.status,
        location: freshRow.location,
        notes: freshRow.notes,
        last_maintenance_date: freshRow.last_maintenance_date,
        next_maintenance_date: freshRow.next_maintenance_date
      })
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (equipment) {
        const outcome = await editSession.save((expectedModifiedAt) =>
          onSubmit(form, expectedModifiedAt)
        )
        if (outcome.status === 'conflict') return
      } else {
        await onSubmit(form)
      }
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>
            {equipment ? 'Edit Equipment' : 'Add Equipment'}
          </SheetTitle>
          <SheetDescription>
            {equipment
              ? 'Update the details for this piece of equipment.'
              : 'Add a new piece of ground-support equipment.'}
          </SheetDescription>
        </SheetHeader>

        {equipment && (
          <div className="px-4 pt-4">
            <EditSessionStatus
              editSession={editSession}
              onOverwriteComplete={() => onOpenChange(false)}
            />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <Label htmlFor="equipment_id">Equipment ID</Label>
              <Input
                id="equipment_id"
                value={form.equipment_id as string}
                onChange={(e) => updateField('equipment_id', e.target.value)}
                disabled={!!equipment}
              />
            </div>

            <div>
              <Label htmlFor="equipment_name">Name</Label>
              <Input
                id="equipment_name"
                value={form.equipment_name as string}
                onChange={(e) => updateField('equipment_name', e.target.value)}
              />
            </div>

            <div>
              <Label>Equipment Type</Label>
              <Select
                value={form.equipment_type as string}
                onValueChange={(value) =>
                  updateField('equipment_type', value as EquipmentType)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={form.manufacturer as string}
                  onChange={(e) => updateField('manufacturer', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={form.model as string}
                  onChange={(e) => updateField('model', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                value={form.serial_number as string}
                onChange={(e) => updateField('serial_number', e.target.value)}
              />
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={form.status as string}
                onValueChange={(value) =>
                  updateField('status', value as EquipmentStatus)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="out_of_service">Out of Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location as string}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes as string}
                onChange={(e) => updateField('notes', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="last_maintenance_date">Last Maintenance</Label>
                <Input
                  id="last_maintenance_date"
                  type="date"
                  value={(form.last_maintenance_date as string) ?? ''}
                  onChange={(e) =>
                    updateField('last_maintenance_date', e.target.value || null)
                  }
                />
              </div>
              <div>
                <Label htmlFor="next_maintenance_date">Next Maintenance</Label>
                <Input
                  id="next_maintenance_date"
                  type="date"
                  value={(form.next_maintenance_date as string) ?? ''}
                  onChange={(e) =>
                    updateField('next_maintenance_date', e.target.value || null)
                  }
                />
              </div>
            </div>
          </div>

          <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading
                ? 'Saving...'
                : equipment
                  ? 'Save Changes'
                  : 'Add Equipment'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
