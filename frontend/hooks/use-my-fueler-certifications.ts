'use client'

import { createClient } from '@/lib/supabase/client'
import { findAllCertifications } from '@/repositories/certifications.repo'
import { findAllFuelers } from '@/repositories/fuelers.repo'
import { toCertificationDomain, type CertificationDomain } from '@/types/domain/certifications'
import { useQuery } from '@tanstack/react-query'

export function useMyFuelerCertifications() {
  const db = createClient()

  const query = useQuery({
    queryKey: ['my-fueler-certifications'],
    queryFn: async () => {
      const { data: { user } } = await db.auth.getUser()
      if (!user?.email) return { certifications: [], fuelerId: null }

      // Find the fueler record linked to the current user by email
      const fuelers = await findAllFuelers(db)
      const fueler = fuelers.find((f) => f.user?.email === user.email) ?? null

      if (!fueler) return { certifications: [], fuelerId: null }

      const rows = await findAllCertifications(db, { fuelerId: fueler.id })
      return {
        certifications: rows.map(toCertificationDomain),
        fuelerId: fueler.id
      }
    }
  })

  return {
    certifications: query.data?.certifications ?? [] as CertificationDomain[],
    fuelerId: query.data?.fuelerId ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
