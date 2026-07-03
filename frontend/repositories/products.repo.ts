import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'

export type ProductRow = Tables<'product'>

export async function findAllProducts(
  db: SupabaseClient<Database>,
  activeOnly = true
): Promise<ProductRow[]> {
  let query = db.from('product').select('*').order('product_type').order('name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data
}
