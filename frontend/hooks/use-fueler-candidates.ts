'use client'

import { fuelerCandidates } from '@/lib/fueler-initials'
import { createClient } from '@/lib/supabase/client'
import { findAllProfiles } from '@/repositories/profiles.repo'
import { useQuery } from '@tanstack/react-query'
import { userKeys } from '@/hooks/use-users'

/** B68: active Line Department users (and Administrators): everyone who could have fueled. */
export function useFuelerCandidates() {
  const db = createClient()
  const query = useQuery({
    queryKey: userKeys.lists(),
    queryFn: () => findAllProfiles(db),
  })
  return { ...query, data: fuelerCandidates(query.data ?? []) }
}
