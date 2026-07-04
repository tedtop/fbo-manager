'use client'

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
import { useRecordEditSession } from '@/hooks/use-record-edit-session'
import type {
  TankInsert,
  TankRow,
  TankWithLatestReading
} from '@/repositories/tanks.repo'
import { useEffect, useState } from 'react'

interface TankFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tank?: TankWithLatestReading | null
  onSubmit: (data: TankInsert, expectedModifiedAt?: string) => Promise<void>
}

export function TankFormDialog({
  open,
  onOpenChange,
  tank,
  onSubmit
}: TankFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<TankInsert>({
    tank_id: '',
    tank_name: '',
    fuel_type: 'jet_a',
    capacity_gallons: '',
    min_level_inches: '',
    max_level_inches: '',
    usable_min_inches: '',
    usable_max_inches: ''
  })

  useEffect(() => {
    if (!open) return
    if (tank) {
      setFormData({
        tank_id: tank.tank_id,
        tank_name: tank.tank_name,
        fuel_type: tank.fuel_type,
        capacity_gallons: tank.capacity_gallons,
        min_level_inches: tank.min_level_inches,
        max_level_inches: tank.max_level_inches,
        usable_min_inches: tank.usable_min_inches,
        usable_max_inches: tank.usable_max_inches
      })
    } else {
      setFormData({
        tank_id: '',
        tank_name: '',
        fuel_type: 'jet_a',
        capacity_gallons: '',
        min_level_inches: '',
        max_level_inches: '',
        usable_min_inches: '',
        usable_max_inches: ''
      })
    }
  }, [tank, open])

  const editSession = useRecordEditSession<TankRow>({
    table: 'fuel_tank',
    idColumn: 'tank_id',
    recordId: tank?.tank_id ?? null,
    modifiedAt: tank?.modified_at ?? null,
    enabled: open && !!tank,
    onReload: (freshRow) => {
      setFormData({
        tank_id: freshRow.tank_id,
        tank_name: freshRow.tank_name,
        fuel_type: freshRow.fuel_type,
        capacity_gallons: freshRow.capacity_gallons,
        min_level_inches: freshRow.min_level_inches,
        max_level_inches: freshRow.max_level_inches,
        usable_min_inches: freshRow.usable_min_inches,
        usable_max_inches: freshRow.usable_max_inches
      })
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (tank) {
        const outcome = await editSession.save((expectedModifiedAt) =>
          onSubmit(formData, expectedModifiedAt)
        )
        if (outcome.status === 'conflict') return
      } else {
        await onSubmit(formData)
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save tank:', error)
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
          <SheetTitle>{tank ? 'Edit Tank' : 'Create Tank'}</SheetTitle>
          <SheetDescription>
            {tank
              ? 'Update the configuration for this fuel tank.'
              : 'Add a new fuel tank to the farm.'}
          </SheetDescription>
        </SheetHeader>
        {tank && (
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tank_id">Tank ID *</Label>
                <Input
                  id="tank_id"
                  value={formData.tank_id as string}
                  onChange={(e) =>
                    setFormData({ ...formData, tank_id: e.target.value })
                  }
                  required
                  placeholder="e.g., TANK-1"
                  disabled={!!tank}
                />
                {tank && (
                  <p className="text-xs text-muted-foreground">
                    Tank ID cannot be changed
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tank_name">Tank Name *</Label>
                <Input
                  id="tank_name"
                  value={formData.tank_name as string}
                  onChange={(e) =>
                    setFormData({ ...formData, tank_name: e.target.value })
                  }
                  required
                  placeholder="e.g., Jet A Main"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fuel Type *</Label>
              <Select
                value={formData.fuel_type as string}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    fuel_type: v as 'jet_a' | 'avgas'
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jet_a">Jet A</SelectItem>
                  <SelectItem value="avgas">Avgas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity (Gallons) *</Label>
              <Input
                id="capacity"
                type="number"
                step="0.01"
                value={formData.capacity_gallons as string}
                onChange={(e) =>
                  setFormData({ ...formData, capacity_gallons: e.target.value })
                }
                required
                placeholder="0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Level (inches) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.min_level_inches as string}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_level_inches: e.target.value
                    })
                  }
                  required
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Level (inches) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.max_level_inches as string}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_level_inches: e.target.value
                    })
                  }
                  required
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Usable Min (inches) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.usable_min_inches as string}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      usable_min_inches: e.target.value
                    })
                  }
                  required
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Usable Max (inches) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.usable_max_inches as string}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      usable_max_inches: e.target.value
                    })
                  }
                  required
                  placeholder="0.00"
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
              {loading ? 'Saving...' : tank ? 'Update' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
