'use client'

import { createClient } from '@/lib/supabase/client'
import {
  deleteCertification,
  findAllCertifications,
  upsertCertification,
  type CertificationFilters,
  type CertificationInsert
} from '@/repositories/certifications.repo'
import { completeCertification } from '@/services/certifications.service'
import { toCertificationDomain, type CertificationDomain } from '@/types/domain/certifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const certificationKeys = {
  all: ['certifications'] as const,
  lists: () => [...certificationKeys.all, 'list'] as const,
  list: (filters?: CertificationFilters) => [...certificationKeys.lists(), filters] as const
}

export function useCertifications(filters?: CertificationFilters) {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: certificationKeys.list(filters),
    queryFn: async () => {
      const rows = await findAllCertifications(db, filters)
      return rows.map(toCertificationDomain)
    }
  })

  const completeMutation = useMutation({
    mutationFn: (input: Parameters<typeof completeCertification>[1]) =>
      completeCertification(db, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: certificationKeys.all })
  })

  const upsertMutation = useMutation({
    mutationFn: (cert: CertificationInsert) => upsertCertification(db, cert),
    onSuccess: () => qc.invalidateQueries({ queryKey: certificationKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCertification(db, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: certificationKeys.all })
  })

  return {
    certifications: query.data ?? [] as CertificationDomain[],
    loading: query.isLoading,
    error: query.error,
    completeCertification: completeMutation.mutateAsync,
    upsertCertification: (cert: CertificationInsert) => upsertMutation.mutateAsync(cert),
    deleteCertification: (id: number) => deleteMutation.mutateAsync(id),
    refetch: query.refetch
  }
}
