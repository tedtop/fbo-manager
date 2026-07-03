import type { Database, Tables } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProductRow = Tables<'product'>

export async function findActiveProducts(
  db: SupabaseClient<Database>
): Promise<ProductRow[]> {
  const { data, error } = await db
    .from('product')
    .select('*')
    .eq('is_active', true)
    .order('product_type')
    .order('name')
  if (error) throw error
  return data
}
