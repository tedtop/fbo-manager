import { type ModuleAccessMap, type ModuleKey, accessAtLeast } from '@/types/domain/users'

/**
 * Edit rights for the Line Schedule and Training pages come from the signed-in account's roles
 * (profiles -> user_roles -> module_permissions, resolved to a ModuleAccessMap), never from the legacy
 * `users` table. The Administrator role holds 'manage' on every module, so an admin edits everything
 * without needing a legacy `users` row (B140). The legacy row is only needed to attribute a change
 * (created_by / recorded_by_id, both nullable) and for department self-service.
 */
export function canManageModule(access: ModuleAccessMap | null | undefined, module: ModuleKey): boolean {
  return !!access && accessAtLeast(access, module, 'manage')
}

/** Line schedule: may edit any shift and pick any employee (admin-level). */
export function canManageLineSchedule(access: ModuleAccessMap | null | undefined): boolean {
  return canManageModule(access, 'line_schedule')
}

/** Training: may manage courses and delete completion records (admin-level). */
export function canManageTraining(access: ModuleAccessMap | null | undefined): boolean {
  return canManageModule(access, 'training')
}
