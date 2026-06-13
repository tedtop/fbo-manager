import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { upsertCertification } from '@/repositories/certifications.repo'
import { createTrainingHistory } from '@/repositories/training-history.repo'

export interface CompleteCertificationInput {
  fuelerId: number
  trainingId: number
  completedDate: string
  expiryDate: string
  certifiedById: number | null
  notes?: string
}

export async function completeCertification(
  db: SupabaseClient<Database>,
  input: CompleteCertificationInput
): Promise<void> {
  // Upsert the current certification record
  await upsertCertification(db, {
    fueler_id: input.fuelerId,
    training_id: input.trainingId,
    completed_date: input.completedDate,
    expiry_date: input.expiryDate,
    certified_by_id: input.certifiedById
  })

  // Record in history for audit trail
  await createTrainingHistory(db, {
    fueler_id: input.fuelerId,
    training_id: input.trainingId,
    completed_date: input.completedDate,
    expiry_date: input.expiryDate,
    certified_by_id: input.certifiedById,
    notes: input.notes ?? ''
  })
}
