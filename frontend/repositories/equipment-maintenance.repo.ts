import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MaintenanceItemRow = Tables<'equipment_maintenance_item'>
export type MaintenanceItemInsert = TablesInsert<'equipment_maintenance_item'>
export type MaintenanceItemUpdate = TablesUpdate<'equipment_maintenance_item'>

/** Live (not soft-deleted) items of one piece of equipment, newest noted first. */
export async function findMaintenanceItems(
  db: SupabaseClient<Database>,
  equipmentId: number
): Promise<MaintenanceItemRow[]> {
  const { data, error } = await db
    .from('equipment_maintenance_item')
    .select('*')
    .eq('equipment_id', equipmentId)
    .is('deleted_at', null)
    .order('noted_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data
}

/** Number of open (live) items per equipment id, for the count badge on the equipment list. */
export async function countOpenMaintenanceItems(
  db: SupabaseClient<Database>
): Promise<Map<number, number>> {
  const { data, error } = await db
    .from('equipment_maintenance_item')
    .select('equipment_id')
    .eq('status', 'open')
    .is('deleted_at', null)
  if (error) throw error
  const counts = new Map<number, number>()
  for (const row of data) counts.set(row.equipment_id, (counts.get(row.equipment_id) ?? 0) + 1)
  return counts
}

export async function createMaintenanceItem(
  db: SupabaseClient<Database>,
  item: MaintenanceItemInsert
): Promise<MaintenanceItemRow> {
  const { data, error } = await db.from('equipment_maintenance_item').insert(item).select().single()
  if (error) throw error
  return data
}

export async function updateMaintenanceItem(
  db: SupabaseClient<Database>,
  id: number,
  updates: MaintenanceItemUpdate
): Promise<MaintenanceItemRow> {
  const { data, error } = await db
    .from('equipment_maintenance_item')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Marks an item resolved now (or at `resolvedAt`), by `resolvedBy`, with optional notes. */
export async function resolveMaintenanceItem(
  db: SupabaseClient<Database>,
  id: number,
  opts: { resolutionNotes?: string; resolvedAt?: string; resolvedBy?: number | null } = {}
): Promise<MaintenanceItemRow> {
  return updateMaintenanceItem(db, id, {
    status: 'resolved',
    resolved_at: opts.resolvedAt ?? new Date().toISOString(),
    resolved_by: opts.resolvedBy ?? null,
    resolution_notes: opts.resolutionNotes ?? '',
  })
}

/** Puts a resolved item back to open (clears the resolution). */
export async function reopenMaintenanceItem(
  db: SupabaseClient<Database>,
  id: number
): Promise<MaintenanceItemRow> {
  return updateMaintenanceItem(db, id, {
    status: 'open',
    resolved_at: null,
    resolved_by: null,
    resolution_notes: '',
  })
}

/** Soft delete: stamps deleted_at, the row stays for lookup. */
export async function deleteMaintenanceItem(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db
    .from('equipment_maintenance_item')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
