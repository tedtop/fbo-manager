'use client'

import { useSession } from '@/hooks/use-session'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useEquipment } from '@/hooks/use-equipment'
import { useEquipmentRealtime } from '@/hooks/use-equipment-realtime'
import { EquipmentFormDialog } from '@/components/equipment/equipment-form-dialog'
import { EquipmentStatusCard, EQUIPMENT_TYPES, formatTypeLabel } from '@/components/equipment/equipment-status-card'
import type { EquipmentStatus } from '@/components/equipment/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { EquipmentDomain } from '@/types/domain/equipment'
import type { EquipmentInsert } from '@/repositories/equipment.repo'

export default function EquipmentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const { equipment, loading, error, createEquipment, updateEquipment, refetch } = useEquipment()
  useEquipmentRealtime()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<EquipmentDomain | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') refetch()
  }, [status, refetch])

  function handleStatusChange(id: number, newStatus: EquipmentStatus) {
    updateEquipment(id, { status: newStatus })
  }

  function handleEdit(item: EquipmentDomain) {
    setEditingEquipment(item)
    setDialogOpen(true)
  }

  async function handleSubmit(data: EquipmentInsert) {
    if (editingEquipment) {
      await updateEquipment(editingEquipment.id, data)
    } else {
      await createEquipment(data)
    }
    refetch()
    setDialogOpen(false)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading equipment...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  const available = equipment.filter(e => e.status === 'available').length
  const inUse = equipment.filter(e => e.status === 'in_use').length
  const outOfService = equipment.filter(e => e.status === 'out_of_service').length
  const maintenanceWarnings = equipment.filter(
    e => e.maintenanceStatus === 'due_soon' || e.maintenanceStatus === 'overdue'
  ).length

  const filteredEquipment =
    typeFilter === 'all' ? equipment : equipment.filter(e => e.equipment_type === typeFilter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Equipment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live status board — updates in real time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {EQUIPMENT_TYPES.map(type => (
                <SelectItem key={type} value={type}>
                  {formatTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => { setEditingEquipment(null); setDialogOpen(true) }}
          >
            Add Equipment
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-card border border-border px-4 py-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{equipment.length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-4 py-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Available</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{available}</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-4 py-3 shadow-sm">
          <p className="text-xs text-muted-foreground">In Use</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">{inUse}</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-4 py-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Out of Service</p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{outOfService}</p>
        </div>
      </div>

      {/* Maintenance warning banner */}
      {maintenanceWarnings > 0 && (
        <div className="rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          ⚠ {maintenanceWarnings} {maintenanceWarnings === 1 ? 'item has' : 'items have'} maintenance due within 30 days
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          Failed to load equipment. Please refresh.
        </div>
      )}

      {/* Status board */}
      {equipment.length === 0 ? (
        <div className="rounded-lg bg-card border border-border p-12 text-center text-muted-foreground">
          No equipment found. Add equipment to get started.
        </div>
      ) : filteredEquipment.length === 0 ? (
        <div className="rounded-lg bg-card border border-border p-12 text-center text-muted-foreground">
          No equipment matches this type.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEquipment.map(item => (
            <EquipmentStatusCard
              key={item.id}
              equipment={item}
              onStatusChange={handleStatusChange}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      <EquipmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        equipment={editingEquipment}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
