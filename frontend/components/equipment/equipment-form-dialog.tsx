'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EquipmentInsert } from '@/repositories/equipment.repo'
import type { EquipmentDomain } from '@/types/domain/equipment'

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

export function EquipmentFormDialog({ open, onOpenChange, equipment, onSubmit }: EquipmentFormDialogProps) {
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

  const updateField = <K extends keyof EquipmentInsert>(key: K, value: EquipmentInsert[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    await onSubmit(form)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{equipment ? 'Edit Equipment' : 'Add Equipment'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <Label>Equipment ID</Label>
            <Input value={form.equipment_id as string}
              onChange={(e) => updateField('equipment_id', e.target.value)}
              disabled={!!equipment} />
          </div>

          <div>
            <Label>Name</Label>
            <Input value={form.equipment_name as string}
              onChange={(e) => updateField('equipment_name', e.target.value)} />
          </div>

          <div>
            <Label>Equipment Type</Label>
            <select className="w-full border rounded p-2" value={form.equipment_type as string}
              onChange={(e) => updateField('equipment_type', e.target.value as EquipmentType)}>
              {['fuel_truck', 'tug', 'gpu', 'air_start', 'belt_loader', 'stairs', 'lavatory_service', 'water_service', 'other'].map((v) => (
                <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer as string}
                onChange={(e) => updateField('manufacturer', e.target.value)} />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={form.model as string}
                onChange={(e) => updateField('model', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Serial Number</Label>
            <Input value={form.serial_number as string}
              onChange={(e) => updateField('serial_number', e.target.value)} />
          </div>

          <div>
            <Label>Status</Label>
            <select className="w-full border rounded p-2" value={form.status as string}
              onChange={(e) => updateField('status', e.target.value as EquipmentStatus)}>
              <option value="available">Available</option>
              <option value="in_use">In Use</option>
              <option value="maintenance">Maintenance</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </div>

          <div>
            <Label>Location</Label>
            <Input value={form.location as string}
              onChange={(e) => updateField('location', e.target.value)} />
          </div>

          <div>
            <Label>Notes</Label>
            <textarea className="w-full border rounded p-2" value={form.notes as string}
              onChange={(e) => updateField('notes', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Last Maintenance</Label>
              <Input type="date" value={(form.last_maintenance_date as string) ?? ''}
                onChange={(e) => updateField('last_maintenance_date', e.target.value || null)} />
            </div>
            <div>
              <Label>Next Maintenance</Label>
              <Input type="date" value={(form.next_maintenance_date as string) ?? ''}
                onChange={(e) => updateField('next_maintenance_date', e.target.value || null)} />
            </div>
          </div>

          <Button className="w-full mt-4" onClick={handleSave}>
            {equipment ? 'Save Changes' : 'Add Equipment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
