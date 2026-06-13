import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type FuelerRow = Tables<'fueler'>
export type FuelerInsert = TablesInsert<'fueler'>
export type FuelerUpdate = TablesUpdate<'fueler'>

export type FuelerWithUser = FuelerRow & {
  user: { id: number; username: string; email: string; first_name: string; last_name: string } | null
}

export async function findAllFuelers(db: SupabaseClient<Database>): Promise<FuelerWithUser[]> {
  const { data, error } = await db
    .from('fueler')
    .select('*, user:user_id ( id, username, email, first_name, last_name )')
    .order('fueler_name')
  if (error) throw error
  return data as FuelerWithUser[]
}

export async function findActiveFuelers(db: SupabaseClient<Database>): Promise<FuelerWithUser[]> {
  const { data, error } = await db
    .from('fueler')
    .select('*, user:user_id ( id, username, email, first_name, last_name )')
    .eq('status', 'active')
    .order('fueler_name')
  if (error) throw error
  return data as FuelerWithUser[]
}

export async function findFuelerById(
  db: SupabaseClient<Database>,
  id: number
): Promise<FuelerWithUser | null> {
  const { data, error } = await db
    .from('fueler')
    .select('*, user:user_id ( id, username, email, first_name, last_name )')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as FuelerWithUser | null
}

export async function createFueler(
  db: SupabaseClient<Database>,
  fueler: FuelerInsert
): Promise<FuelerRow> {
  const { data, error } = await db.from('fueler').insert(fueler).select().single()
  if (error) throw error
  return data
}

export async function updateFueler(
  db: SupabaseClient<Database>,
  id: number,
  updates: FuelerUpdate
): Promise<FuelerRow> {
  const { data, error } = await db
    .from('fueler')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
