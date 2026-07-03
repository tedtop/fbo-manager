'use client'

import { cn } from '@/lib/utils'
import { StatusBadge, type EquipmentStatus } from './status-badge'
import type { EquipmentDomain } from '@/types/domain/equipment'

const TYPE_ICONS: Record<string, string> = {
  fuel_truck:       '🚛',
  tug:              '🚜',
  gpu:              '⚡',
  air_start:        '💨',
  belt_loader:      '🧰',
  stairs:           '🪜',
  lavatory_service: '🚿',
  water_service:    '💧',
  other:            '🔧',
}

const STATUS_BORDER: Record<string, string> = {
  available:      'border-l-green-500',
  in_use:         'border-l-yellow-500',
  maintenance:    'border-l-yellow-500',
  out_of_service: 'border-l-red-500',
}

function formatTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAvailableAt(ts: string | null): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (d <= new Date()) return null
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

interface EquipmentStatusCardProps {
  equipment: EquipmentDomain
  onStatusChange: (id: number, status: EquipmentStatus) => void
  onEdit: (equipment: EquipmentDomain) => void
}

export function EquipmentStatusCard({ equipment: eq, onStatusChange, onEdit }: EquipmentStatusCardProps) {
  const icon = TYPE_ICONS[eq.equipment_type] ?? '🔧'
  const borderColor = STATUS_BORDER[eq.status] ?? 'border-l-border'
  const availableAt = formatAvailableAt(eq.available_at)
  const maintenanceDate = formatDate(eq.next_maintenance_date)
  const lastSeen = daysSince(eq.modified_at)

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
            <p className="font-semibold text-foreground truncate">{eq.equipment_name}</p>
            <p className="text-xs text-muted-foreground">{formatTypeLabel(eq.equipment_type)}</p>
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
      <div>
        <StatusBadge
          status={eq.status as EquipmentStatus}
          onStatusChange={s => onStatusChange(eq.id, s)}
        />
      </div>

      {/* Info rows */}
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Fueler</span>
          <span className="text-foreground font-medium truncate">
            {eq.fueler ? eq.fueler.fueler_name : 'Available'}
          </span>
        </div>

        {availableAt && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Available at</span>
            <span className="text-foreground">{availableAt}</span>
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
        Last seen{' '}
        {lastSeen === 0 ? 'today' : lastSeen === 1 ? 'yesterday' : `${lastSeen} days ago`}
      </p>
    </div>
  )
}
