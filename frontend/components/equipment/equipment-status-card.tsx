'use client'

import { useAppSettings } from '@/hooks/use-app-settings'
import { equipmentTypeIcon, equipmentTypeLabel } from '@/lib/app-settings'
import Link from 'next/link'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { formatLocalDate, formatLocalTime } from '@/lib/local-date'
import { cn } from '@/lib/utils'
import { StatusBadge, type EquipmentStatus } from './status-badge'
import type { EquipmentDomain } from '@/types/domain/equipment'

const STATUS_BORDER: Record<string, string> = {
  available:      'border-l-green-500',
  in_use:         'border-l-yellow-500',
  maintenance:    'border-l-yellow-500',
  out_of_service: 'border-l-red-500',
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

interface EquipmentStatusCardProps {
  equipment: EquipmentDomain
  onStatusChange: (id: number, status: EquipmentStatus) => void
  onEdit: (equipment: EquipmentDomain) => void
  /** Open maintenance items (count badge); 0 or missing shows nothing. */
  openItems?: number
}

export function EquipmentStatusCard({ equipment: eq, onStatusChange, onEdit, openItems = 0 }: EquipmentStatusCardProps) {
  const { settings } = useAppSettings()
  const icon = equipmentTypeIcon(settings.equipmentTypes, eq.equipment_type)
  const borderColor = STATUS_BORDER[eq.status] ?? 'border-l-border'
  const maintenanceDate = formatDate(eq.next_maintenance_date)
  const { fboZone, suffixAt } = useDisplayZone()
  const updated = new Date(eq.updated_at)

  const isMaintenanceWarning =
    eq.maintenanceStatus === 'due_soon' || eq.maintenanceStatus === 'overdue'

  return (
    <div
      className={cn(
        'rounded-lg border border-border border-l-4 bg-card shadow-sm flex flex-col gap-3 p-4',
        borderColor,
        isMaintenanceWarning && 'ring-1 ring-yellow-400/50'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0" aria-hidden="true">{icon}</span>
          <div className="min-w-0">
            <Link href={`/equipment/${eq.id}`} className="block font-semibold text-foreground truncate hover:underline" data-testid={`equipment-link-${eq.equipment_id}`}>
              {eq.equipment_name}
            </Link>
            <p className="text-xs text-muted-foreground">{equipmentTypeLabel(settings.equipmentTypes, eq.equipment_type)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEdit(eq)}
          className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0 underline-offset-2 hover:underline"
        >
          Edit
        </button>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge
          status={eq.status as EquipmentStatus}
          onStatusChange={s => onStatusChange(eq.id, s)}
        />
        {openItems > 0 && (
          <Link
            href={`/equipment/${eq.id}`}
            className="rounded-full border border-yellow-500/60 px-2 py-0.5 text-xs text-yellow-800 dark:text-yellow-300"
            data-testid="open-maintenance-count"
          >
            {openItems} open maintenance {openItems === 1 ? 'item' : 'items'}
          </Link>
        )}
      </div>

      {/* Info rows */}
      <div className="space-y-1 text-sm">
        {eq.dpi_reading && (
          <div className="flex items-center justify-between gap-2" data-testid="dpi-reading">
            <span className="text-muted-foreground">DPI</span>
            <span className="font-medium">{eq.dpi_reading}</span>
          </div>
        )}
        {maintenanceDate && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Maintenance due</span>
            <span
              className={cn(
                'font-medium',
                eq.maintenanceStatus === 'overdue' && 'text-red-600 dark:text-red-400',
                eq.maintenanceStatus === 'due_soon' && 'text-yellow-600 dark:text-yellow-400',
                eq.maintenanceStatus === 'current' && 'text-foreground'
              )}
            >
              {eq.maintenanceStatus === 'overdue' && '⚠ '}
              {maintenanceDate}
            </span>
          </div>
        )}

        {isMaintenanceWarning && eq.daysUntilMaintenance !== null && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            {eq.daysUntilMaintenance < 0
              ? `Overdue by ${Math.abs(eq.daysUntilMaintenance)} days`
              : `Due in ${eq.daysUntilMaintenance} days`}
          </p>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-auto">
        Last updated at {formatLocalDate(updated, fboZone)} {formatLocalTime(updated, fboZone)} {suffixAt(eq.updated_at)}
      </p>
    </div>
  )
}
