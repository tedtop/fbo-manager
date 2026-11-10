'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { MeterGaps } from '@/components/equipment/meter-gaps'
import { DailyReadings } from '@/components/equipment/daily-readings'
import { EquipmentNotes } from '@/components/equipment/equipment-notes'
import { FilterChanges } from '@/components/equipment/filter-changes'
import { useStatusChange } from '@/components/equipment/use-status-change'
import { MaintenanceItems } from '@/components/equipment/maintenance-items'
import { StatusBadge, type EquipmentStatus } from '@/components/equipment/status-badge'
import { TruckReadings } from '@/components/equipment/truck-readings'
import { Card } from '@/components/ui/card'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useEquipment } from '@/hooks/use-equipment'
import { useModuleAccess } from '@/hooks/use-permissions'
import { useSession } from '@/hooks/use-session'
import { equipmentTypeIcon, equipmentTypeLabel } from '@/lib/app-settings'
import { ErrorMessage } from '@/messages/error-message'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params)
  const id = Number(rawId)
  const { status } = useSession()
  const router = useRouter()
  const { settings } = useAppSettings()
  const { equipment, loading, error, updateEquipment } = useEquipment()
  const { allowed: canSeeTruckSheets } = useModuleAccess('truck_sheets')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const { requestStatus, dialog: statusDialog } = useStatusChange((sid, st) => updateEquipment(sid, { status: st }))

  const item = equipment.find((e) => e.id === id)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/equipment" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Equipment
        </Link>
      </div>

      {error && <ErrorMessage>Failed to load equipment. Please refresh.</ErrorMessage>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && !error && !item && <p className="text-sm text-muted-foreground">Equipment not found.</p>}

      {item && (
        <>
          <Card className="p-4 space-y-3" data-testid="equipment-header">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-2xl shrink-0" aria-hidden="true">{equipmentTypeIcon(settings.equipmentTypes, item.equipment_type)}</span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold break-words">{item.equipment_name}</h1>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">{item.equipment_id}</span> · {equipmentTypeLabel(settings.equipmentTypes, item.equipment_type)}
                </p>
              </div>
            </div>
            <div>
              <StatusBadge status={item.status as EquipmentStatus} onStatusChange={(s) => requestStatus(item, s)} />
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">Last maintenance</dt>
                <dd>{formatDate(item.last_maintenance_date)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">Next maintenance</dt>
                <dd>{formatDate(item.next_maintenance_date)}</dd>
              </div>
            </dl>
            {item.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{item.notes}</p>}
          </Card>

          <MaintenanceItems
            equipmentId={item.id}
            onAllResolved={() => {
              if (item.status === 'out_of_service' && confirm(`All items resolved. Set ${item.equipment_name} back to Available?`)) {
                void updateEquipment(item.id, { status: 'available' })
              }
            }}
          />
          {item.equipment_type === 'fuel_truck' && (
            <>
              <DailyReadings equipmentId={item.id} />
              <FilterChanges equipmentId={item.id} />
            </>
          )}
          <EquipmentNotes equipmentId={item.id} />
          {canSeeTruckSheets && <MeterGaps equipmentId={item.id} />}
          {canSeeTruckSheets && <TruckReadings equipmentId={item.id} truckNumber={item.equipment_id} />}
        </>
      )}
      {statusDialog}
    </div>
  )
}
