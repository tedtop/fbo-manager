import type { CertificationWithRelations } from '@/repositories/certifications.repo'

export type ExpiryStatus =
  | 'expired'
  | 'critical'
  | 'warning'
  | 'caution'
  | 'valid'
  | 'unknown'

export interface CertificationDomain {
  id: number
  fuelerId: number
  fuelerName: string
  trainingId: number
  trainingName: string
  completedDate: string
  expiryDate: string
  certifiedById: number | null
  certifiedByName: string
  daysUntilExpiry: number
  expiryStatus: ExpiryStatus
}

function computeExpiryStatus(daysUntilExpiry: number): ExpiryStatus {
  if (daysUntilExpiry < 0) return 'expired'
  if (daysUntilExpiry <= 7) return 'critical'
  if (daysUntilExpiry <= 30) return 'warning'
  if (daysUntilExpiry <= 60) return 'caution'
  return 'valid'
}

export function toCertificationDomain(
  row: CertificationWithRelations
): CertificationDomain {
  const today = new Date()
  const expiry = new Date(row.expiry_date)
  const daysUntilExpiry = Math.floor(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  const certifiedByName = row.certified_by
    ? `${row.certified_by.first_name} ${row.certified_by.last_name}`.trim() ||
      row.certified_by.username
    : 'Unknown'

  return {
    id: row.id,
    fuelerId: row.fueler_id,
    fuelerName: row.fueler?.fueler_name ?? 'Unknown',
    trainingId: row.training_id,
    trainingName: row.training?.training_name ?? 'Unknown',
    completedDate: row.completed_date,
    expiryDate: row.expiry_date,
    certifiedById: row.certified_by_id,
    certifiedByName,
    daysUntilExpiry,
    expiryStatus: computeExpiryStatus(daysUntilExpiry)
  }
}
