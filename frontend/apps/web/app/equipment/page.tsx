'use client'

import { useTheme } from '@/components/navigation-wrapper'
import { useSession } from '@/hooks/use-session'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { EquipmentFormDialog } from '@/components/equipment/equipment-form-dialog'
import { useEquipment } from '@/hooks/use-equipment'
import {
  EQUIPMENT_TYPES,
  type EquipmentType,
  getEquipmentTypeDefinition
} from '@/lib/equipment-types'
import type { EquipmentDomain } from '@/types/domain/equipment'
import { Button } from '@frontend/ui/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@frontend/ui/components/ui/select'

export default function EquipmentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme } = useTheme()

  // Use your equipment API hook
  const {
    equipment,
    loading,
    error,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    refetch
  } = useEquipment()

  // modal states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEquipment, setEditingEquipment] =
    useState<EquipmentDomain | null>(null)

  // type filter
  const [typeFilter, setTypeFilter] = useState<EquipmentType | 'all'>('all')
  const filteredEquipment =
    typeFilter === 'all'
      ? equipment
      : equipment.filter((e) => e.equipment_type === typeFilter)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      refetch()
    }
  }, [status, refetch])

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">
          Loading equipment...
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Equipment</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage ground support equipment inventory
          </p>
        </div>

        {/* ADD EQUIPMENT BUTTON */}
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            setEditingEquipment(null) // create mode
            setDialogOpen(true)
          }}
        >
          Add Equipment
        </Button>
      </div>

      {/* DASHBOARD CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Total Equipment
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {equipment.length}
          </div>
        </div>
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Available
          </div>
          <div className="mt-2 text-3xl font-bold text-success">
            {equipment.filter((e) => e.status === 'available').length}
          </div>
        </div>
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Maintenance
          </div>
          <div className="mt-2 text-3xl font-bold text-warning">
            {equipment.filter((e) => e.status === 'maintenance').length}
          </div>
        </div>
      </div>

      {/* TABLE OR PLACEHOLDER */}
      <div className="rounded-lg bg-card shadow border border-border">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            Equipment Inventory
          </h2>

          <Select
            value={typeFilter}
            onValueChange={(value) =>
              setTypeFilter(value as EquipmentType | 'all')
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {EQUIPMENT_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredEquipment.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-muted-foreground">
              {equipment.length === 0
                ? 'No equipment found. Add equipment to get started.'
                : 'No equipment matches this type.'}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <ul className="space-y-2">
              {filteredEquipment.map((item) => {
                const { label, icon: Icon } = getEquipmentTypeDefinition(
                  item.equipment_type
                )
                return (
                  <li
                    key={item.id}
                    className="p-4 border rounded flex justify-between items-center bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="size-5 text-muted-foreground shrink-0" />
                      <div>
                        <strong>{item.equipment_name}</strong>
                        <div className="text-muted-foreground text-sm">
                          {label} • {item.status}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingEquipment(item)
                        setDialogOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {/* FORM MODAL */}
      <EquipmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        equipment={editingEquipment}
        onSubmit={async (data) => {
          if (editingEquipment) {
            await updateEquipment(editingEquipment.id, data)
          } else {
            await createEquipment(data)
          }
          refetch()
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
