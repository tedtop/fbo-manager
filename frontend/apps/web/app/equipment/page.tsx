'use client'

import { useTheme } from '@/components/navigation-wrapper'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useEquipment } from '@/hooks/use-equipment'
import { EquipmentFormDialog } from '@/components/equipment/equipment-form-dialog'
import { Button } from '@frontend/ui/components/ui/button'

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
    refetch,
  } = useEquipment()

  // modal states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState(null)

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
            setEditingEquipment(null)  // create mode
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
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Equipment Inventory
          </h2>
        </div>

        {equipment.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-muted-foreground">
              No equipment found. Add equipment to get started.
            </div>
          </div>
        ) : (
          <div className="p-6">
            <ul className="space-y-2">
              {equipment.map((item) => (
                <li
                  key={item.id}
                  className="p-4 border rounded flex justify-between items-center bg-card"
                >
                  <div>
                    <strong>{item.equipment_name}</strong>
                    <div className="text-muted-foreground text-sm">
                      {item.equipment_type} • {item.status}
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
              ))}
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

