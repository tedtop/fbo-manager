import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type CustomerRow = Tables<'customer'>
export type CustomerInsert = TablesInsert<'customer'>
export type CustomerUpdate = TablesUpdate<'customer'>

export async function findAllCustomers(
  db: SupabaseClient<Database>
): Promise<CustomerRow[]> {
  const { data, error } = await db
    .from('customer')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function findCustomerById(
  db: SupabaseClient<Database>,
  id: number
): Promise<CustomerRow | null> {
  const { data, error } = await db
    .from('customer')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createCustomer(
  db: SupabaseClient<Database>,
  customer: CustomerInsert
): Promise<CustomerRow> {
  const { data, error } = await db
    .from('customer')
    .insert(customer)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCustomer(
  db: SupabaseClient<Database>,
  id: number,
  updates: CustomerUpdate
): Promise<CustomerRow> {
  const { data, error } = await db
    .from('customer')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
