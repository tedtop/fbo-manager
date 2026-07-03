'use client'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { findModuleAccessForUser } from '@/repositories/user-roles.repo'
import {
  type AccessLevel,
  type ModuleKey,
  accessAtLeast
} from '@/types/domain/users'
import { useQuery } from '@tanstack/react-query'

/** The current user's effective per-module access, resolved from their roles. */
export function useMyPermissions() {
  const { session } = useAuth()
  const db = createClient()
  const userId = session?.user?.id

  const query = useQuery({
    queryKey: ['my-permissions', userId],
    queryFn: () => findModuleAccessForUser(db, userId as string),
    enabled: !!userId
  })

  return {
    access: query.data ?? {},
    loading: session === undefined || query.isLoading,
    refetch: query.refetch
  }
}

/** Convenience check for a single module, e.g. useModuleAccess('users', 'manage'). */
export function useModuleAccess(module: ModuleKey, min: AccessLevel = 'view') {
  const { access, loading } = useMyPermissions()
  return {
    allowed: accessAtLeast(access, module, min),
    loading
  }
}
