import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CustomerRow = Tables<'customer'>
export type CustomerInsert = TablesInsert<'customer'>

export async function findAllCustomers(
  db: SupabaseClient<Database>
): Promise<CustomerRow[]> {
  const { data, error } = await db.from('customer').select('*').order('name')
  if (error) throw error
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
