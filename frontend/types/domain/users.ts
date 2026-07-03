import type { Tables } from '@/types/database'

export type ProfileRow = Tables<'profiles'>
export type RoleRow = Tables<'roles'>
export type ModulePermissionRow = Tables<'module_permissions'>
export type UserRoleRow = Tables<'user_roles'>

export type ModuleKey = ModulePermissionRow['module']
export type AccessLevel = ModulePermissionRow['access_level']

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'equipment', label: 'Equipment' },
  { key: 'invoicing', label: 'Invoicing' },
  { key: 'training', label: 'Training' },
  { key: 'parking', label: 'Parking' },
  { key: 'flight_operations', label: 'Flight Operations' },
  { key: 'line_schedule', label: 'Line Schedule' },
  { key: 'truck_sheets', label: 'Truck Sheets' },
  { key: 'fuel_farm', label: 'Fuel Farm' },
  { key: 'users', label: 'User Management' }
]

export interface RoleWithPermissions extends RoleRow {
  permissions: ModulePermissionRow[]
}

export interface ProfileWithRoles extends ProfileRow {
  roles: RoleRow[]
}

/** module -> highest access level the current user holds across all of their roles */
export type ModuleAccessMap = Partial<Record<ModuleKey, AccessLevel>>

export function accessAtLeast(
  map: ModuleAccessMap,
  module: ModuleKey,
  min: AccessLevel
): boolean {
  const level = map[module]
  if (!level) return false
  if (min === 'view') return true
  return level === 'manage'
}
