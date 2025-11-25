'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@frontend/ui/components/ui/dialog'
import { Button } from '@frontend/ui/components/ui/button'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'

import type { Equipment, EquipmentRequest } from '@frontend/types/api'

interface EquipmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment?: Equipment | null     // undefined = create mode, object = edit mode
  onSubmit: (data: EquipmentRequest) => Promise<void>
}

export function EquipmentFormDialog({
  open,
  onOpenChange,
  equipment,
  onSubmit
}: EquipmentFormDialogProps) {
  const [form, setForm] = useState<EquipmentRequest>({
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
  })

  // Populate form in edit mode
  useEffect(() => {
    if (equipment) {
      setForm({
        equipment_id: equipment.equipment_id ?? '',
        equipment_name: equipment.equipment_name ?? '',
        equipment_type: equipment.equipment_type ?? 'fuel_truck',
        manufacturer: equipment.manufacturer ?? '',
        model: equipment.model ?? '',
        serial_number: equipment.serial_number ?? '',
        status: equipment.status ?? 'available',
        location: equipment.location ?? '',
        notes: equipment.notes ?? '',
        last_maintenance_date: equipment.last_maintenance_date ?? null,
        next_maintenance_date: equipment.next_maintenance_date ?? null
      })
    } else {
      // Reset on create mode
      setForm({
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
      })
    }
  }, [equipment])

  const updateField = (key: keyof EquipmentRequest, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    await onSubmit(form)
    onOpenChange(false)
  }

  const title = equipment ? 'Edit Equipment' : 'Add Equipment'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* FORM CONTENT */}
        <div className="space-y-4 mt-4">
          
          <div>
            <Label>Equipment ID</Label>
            <Input
              value={form.equipment_id}
              onChange={(e) => updateField('equipment_id', e.target.value)}
              disabled={!!equipment} // can't change PK when editing
            />
          </div>

          <div>
            <Label>Name</Label>
            <Input
              value={form.equipment_name}
              onChange={(e) => updateField('equipment_name', e.target.value)}
            />
          </div>

          <div>
            <Label>Equipment Type</Label>
            <select
              className="w-full border rounded p-2"
              value={form.equipment_type}
              onChange={(e) => updateField('equipment_type', e.target.value)}
            >
              <option value="fuel_truck">Fuel Truck</option>
              <option value="tug">Tug</option>
              <option value="gpu">Ground Power Unit</option>
              <option value="air_start">Air Start Unit</option>
              <option value="belt_loader">Belt Loader</option>
              <option value="stairs">Passenger Stairs</option>
              <option value="lavatory_service">Lavatory Service</option>
              <option value="water_service">Water Service</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer}
                onChange={(e) => updateField('manufacturer', e.target.value)}
              />
            </div>

            <div>
              <Label>Model</Label>
              <Input
                value={form.model}
                onChange={(e) => updateField('model', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Serial Number</Label>
            <Input
              value={form.serial_number}
              onChange={(e) => updateField('serial_number', e.target.value)}
            />
          </div>

          <div>
            <Label>Status</Label>
            <select
              className="w-full border rounded p-2"
              value={form.status}
              onChange={(e) => updateField('status', e.target.value)}
            >
              <option value="available">Available</option>
              <option value="in_use">In Use</option>
              <option value="maintenance">Maintenance</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </div>

          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <textarea
              className="w-full border rounded p-2"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </div>

          {/* Maintenance Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Last Maintenance</Label>
              <Input
                type="date"
                value={form.last_maintenance_date ?? ''}
                onChange={(e) => updateField('last_maintenance_date', e.target.value)}
              />
            </div>

            <div>
              <Label>Next Maintenance</Label>
              <Input
                type="date"
                value={form.next_maintenance_date ?? ''}
                onChange={(e) => updateField('next_maintenance_date', e.target.value)}
              />
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

