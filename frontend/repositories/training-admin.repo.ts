import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type ComplianceFueler = { id: number; fueler_name: string }
export type ComplianceCourse = { id: number; training_name: string; validity_period_days: number }
export type ComplianceRecord = {
  certification_id: number
  fueler_id: number
  training_id: number
  completed_date: string
  expiry_date: string
}

export type ComplianceMatrixData = {
  fuelers: ComplianceFueler[]
  courses: ComplianceCourse[]
  records: ComplianceRecord[]
}

export async function fetchComplianceMatrix(
  db: SupabaseClient<Database>
): Promise<ComplianceMatrixData> {
  const [fuelersRes, coursesRes, recordsRes] = await Promise.all([
    db.from('fueler').select('id, fueler_name').eq('status', 'active').order('fueler_name'),
    db.from('training').select('id, training_name, validity_period_days').order('training_name'),
    db.from('fueler_training').select('id, fueler_id, training_id, completed_date, expiry_date')
  ])

  if (fuelersRes.error) throw fuelersRes.error
  if (coursesRes.error) throw coursesRes.error
  if (recordsRes.error) throw recordsRes.error

  return {
    fuelers: fuelersRes.data as ComplianceFueler[],
    courses: coursesRes.data as ComplianceCourse[],
    records: recordsRes.data.map((r) => ({
      certification_id: r.id,
      fueler_id: r.fueler_id,
      training_id: r.training_id,
      completed_date: r.completed_date,
      expiry_date: r.expiry_date
    }))
  }
}
