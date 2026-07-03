'use client'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { findProfileById, updateProfile } from '@/repositories/profiles.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useMyProfile() {
  const qc = useQueryClient()
  const db = createClient()
  const { session } = useAuth()
  const userId = session?.user?.id

  const query = useQuery({
    queryKey: ['my-profile', userId],
    queryFn: () => findProfileById(db, userId as string),
    enabled: !!userId
  })

  const updateMutation = useMutation({
    mutationFn: (updates: {
      first_name: string
      last_name: string
      phone_number: string
    }) =>
      updateProfile(db, userId as string, { ...updates, updated_by: userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile', userId] })
      qc.invalidateQueries({ queryKey: ['current-user'] })
    }
  })

  return {
    profile: query.data ?? null,
    loading: session === undefined || query.isLoading,
    error: query.error,
    updateProfile: (updates: {
      first_name: string
      last_name: string
      phone_number: string
    }) => updateMutation.mutateAsync(updates)
  }
}
