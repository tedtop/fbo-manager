import type { EquipmentRow } from '@/repositories/equipment.repo'

export type MaintenanceStatus = 'overdue' | 'due_soon' | 'current' | 'not_scheduled'

export interface EquipmentDomain extends EquipmentRow {
  maintenanceStatus: MaintenanceStatus
  daysUntilMaintenance: number | null
}

function computeMaintenanceStatus(nextDate: string | null): MaintenanceStatus {
  if (!nextDate) return 'not_scheduled'
  const today = new Date()
  const next = new Date(nextDate)
  const days = Math.floor((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'overdue'
  if (days <= 30) return 'due_soon'
  return 'current'
}

export function toEquipmentDomain(row: EquipmentRow): EquipmentDomain {
  const nextDate = row.next_maintenance_date
  const maintenanceStatus = computeMaintenanceStatus(nextDate)
  let daysUntilMaintenance: number | null = null
  if (nextDate) {
    daysUntilMaintenance = Math.floor(
      (new Date(nextDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  }
  return { ...row, maintenanceStatus, daysUntilMaintenance }
}
