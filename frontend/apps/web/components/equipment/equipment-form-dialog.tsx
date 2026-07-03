'use client'

import { EQUIPMENT_TYPES } from '@/lib/equipment-types'
import type { EquipmentInsert } from '@/repositories/equipment.repo'
import type { EquipmentDomain } from '@/types/domain/equipment'
import { Button } from '@frontend/ui/components/ui/button'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@frontend/ui/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@frontend/ui/components/ui/sheet'
import { Textarea } from '@frontend/ui/components/ui/textarea'
import { useEffect, useState } from 'react'

interface EquipmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment?: EquipmentDomain | null
  onSubmit: (data: EquipmentInsert) => Promise<void>
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

  const handleSave = async () => {
    await onSubmit(form)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {equipment ? 'Edit Equipment' : 'Add Equipment'}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div>
            <Label>Equipment ID</Label>
            <Input
              value={form.equipment_id as string}
              onChange={(e) => updateField('equipment_id', e.target.value)}
              disabled={!!equipment}
            />
          </div>

          <div>
            <Label>Name</Label>
            <Input
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
                {EQUIPMENT_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer as string}
                onChange={(e) => updateField('manufacturer', e.target.value)}
              />
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.model as string}
                onChange={(e) => updateField('model', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Serial Number</Label>
            <Input
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
            <Label>Location</Label>
            <Input
              value={form.location as string}
              onChange={(e) => updateField('location', e.target.value)}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes as string}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Last Maintenance</Label>
              <Input
                type="date"
                value={(form.last_maintenance_date as string) ?? ''}
                onChange={(e) =>
                  updateField('last_maintenance_date', e.target.value || null)
                }
              />
            </div>
            <div>
              <Label>Next Maintenance</Label>
              <Input
                type="date"
                value={(form.next_maintenance_date as string) ?? ''}
                onChange={(e) =>
                  updateField('next_maintenance_date', e.target.value || null)
                }
              />
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button className="w-full" onClick={handleSave}>
            {equipment ? 'Save Changes' : 'Add Equipment'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
