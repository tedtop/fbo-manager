import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient<Database>

export type ReadingRow = Tables<'equipment_reading'>
export type ReadingInsert = TablesInsert<'equipment_reading'>
export type FilterChangeRow = Tables<'equipment_filter_change'>
export type FilterChangeInsert = TablesInsert<'equipment_filter_change'>
export type NoteRow = Tables<'equipment_note'>
export type NoteInsert = TablesInsert<'equipment_note'>

async function softDelete(db: Db, table: 'equipment_reading' | 'equipment_filter_change' | 'equipment_note', id: number) {
  const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/** Live readings of one piece of equipment, newest first. */
export async function findReadings(db: Db, equipmentId: number, limit = 120): Promise<ReadingRow[]> {
  const { data, error } = await db
    .from('equipment_reading')
    .select('*')
    .eq('equipment_id', equipmentId)
    .is('deleted_at', null)
    .order('read_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function findFilterChanges(db: Db, equipmentId: number): Promise<FilterChangeRow[]> {
  const { data, error } = await db
    .from('equipment_filter_change')
    .select('*')
    .eq('equipment_id', equipmentId)
    .is('deleted_at', null)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data
}

export async function findNotes(db: Db, equipmentId: number): Promise<NoteRow[]> {
  const { data, error } = await db
    .from('equipment_note')
    .select('*')
    .eq('equipment_id', equipmentId)
    .is('deleted_at', null)
    .order('noted_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data
}

export async function createReading(db: Db, row: ReadingInsert): Promise<ReadingRow> {
  const { data, error } = await db.from('equipment_reading').insert(row).select().single()
  if (error) throw error
  return data
}
export async function updateReading(db: Db, id: number, updates: TablesUpdate<'equipment_reading'>): Promise<ReadingRow> {
  const { data, error } = await db.from('equipment_reading').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export const deleteReading = (db: Db, id: number) => softDelete(db, 'equipment_reading', id)

export async function createFilterChange(db: Db, row: FilterChangeInsert): Promise<FilterChangeRow> {
  const { data, error } = await db.from('equipment_filter_change').insert(row).select().single()
  if (error) throw error
  return data
}
export const deleteFilterChange = (db: Db, id: number) => softDelete(db, 'equipment_filter_change', id)

export async function createNote(db: Db, row: NoteInsert): Promise<NoteRow> {
  const { data, error } = await db.from('equipment_note').insert(row).select().single()
  if (error) throw error
  return data
}
export async function updateNote(db: Db, id: number, updates: TablesUpdate<'equipment_note'>): Promise<NoteRow> {
  const { data, error } = await db.from('equipment_note').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export const deleteNote = (db: Db, id: number) => softDelete(db, 'equipment_note', id)

/** Latest live reading per equipment id (DPI / nozzle PSI on the list card). */
export async function findLatestReadings(db: Db): Promise<Map<number, ReadingRow>> {
  const { data, error } = await db
    .from('equipment_reading')
    .select('*')
    .is('deleted_at', null)
    .order('read_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const latest = new Map<number, ReadingRow>()
  for (const r of data) if (!latest.has(r.equipment_id)) latest.set(r.equipment_id, r)
  return latest
}

/** Latest live filter change per equipment id (filter age on the list card). */
export async function findLatestFilterChanges(db: Db): Promise<Map<number, FilterChangeRow>> {
  const { data, error } = await db
    .from('equipment_filter_change')
    .select('*')
    .is('deleted_at', null)
    .order('changed_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const latest = new Map<number, FilterChangeRow>()
  for (const r of data) if (!latest.has(r.equipment_id)) latest.set(r.equipment_id, r)
  return latest
}
