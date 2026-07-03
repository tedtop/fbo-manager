'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type RoleInsert,
  type RoleUpdate,
  createRole,
  deleteRole,
  findAllRoles,
  setRolePermissions,
  updateRole
} from '@/repositories/roles.repo'
import type { AccessLevel, ModuleKey } from '@/types/domain/users'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const roleKeys = {
  all: ['roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const
}

export function useRoles() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: roleKeys.lists(),
    queryFn: () => findAllRoles(db)
  })

  const createMutation = useMutation({
    mutationFn: async ({
      role,
      permissions
    }: {
      role: RoleInsert
      permissions: Partial<Record<ModuleKey, AccessLevel | null>>
    }) => {
      const created = await createRole(db, role)
      await setRolePermissions(db, created.id, permissions)
      return created
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      roleId,
      updates,
      permissions
    }: {
      roleId: number
      updates: RoleUpdate
      permissions: Partial<Record<ModuleKey, AccessLevel | null>>
    }) => {
      await updateRole(db, roleId, updates)
      await setRolePermissions(db, roleId, permissions)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (roleId: number) => deleteRole(db, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all })
  })

  return {
    roles: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createRole: (
      role: RoleInsert,
      permissions: Partial<Record<ModuleKey, AccessLevel | null>>
    ) => createMutation.mutateAsync({ role, permissions }),
    updateRole: (
      roleId: number,
      updates: RoleUpdate,
      permissions: Partial<Record<ModuleKey, AccessLevel | null>>
    ) => updateMutation.mutateAsync({ roleId, updates, permissions }),
    deleteRole: (roleId: number) => deleteMutation.mutateAsync(roleId),
    refetch: query.refetch
  }
}
