import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type CertificationRow = Tables<'fueler_training'>
export type CertificationInsert = TablesInsert<'fueler_training'>
export type CertificationUpdate = TablesUpdate<'fueler_training'>

export type CertificationWithRelations = CertificationRow & {
  fueler: { id: number; fueler_name: string } | null
  training: { id: number; training_name: string; validity_period_days: number } | null
  certified_by: { id: number; username: string; first_name: string; last_name: string } | null
}

const CERT_SELECT = `
  *,
  fueler:fueler_id ( id, fueler_name ),
  training:training_id ( id, training_name, validity_period_days ),
  certified_by:certified_by_id ( id, username, first_name, last_name )
`

export interface CertificationFilters {
  fuelerId?: number
  status?: 'expired' | 'expiring_soon' | 'valid'
  days?: number
}

export async function findAllCertifications(
  db: SupabaseClient<Database>,
  filters?: CertificationFilters
): Promise<CertificationWithRelations[]> {
  let query = db.from('fueler_training').select(CERT_SELECT).order('expiry_date')

  if (filters?.fuelerId) {
    query = query.eq('fueler_id', filters.fuelerId)
  }

  if (filters?.status === 'expired') {
    query = query.lt('expiry_date', new Date().toISOString().split('T')[0])
  } else if (filters?.status === 'expiring_soon') {
    const days = filters.days ?? 30
    const future = new Date()
    future.setDate(future.getDate() + days)
    query = query
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .lte('expiry_date', future.toISOString().split('T')[0])
  } else if (filters?.status === 'valid') {
    query = query.gte('expiry_date', new Date().toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) throw error
  return data as CertificationWithRelations[]
}

export async function upsertCertification(
  db: SupabaseClient<Database>,
  cert: CertificationInsert
): Promise<CertificationRow> {
  const { data, error } = await db
    .from('fueler_training')
    .upsert(cert, { onConflict: 'fueler_id,training_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCertification(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('fueler_training').delete().eq('id', id)
  if (error) throw error
}
