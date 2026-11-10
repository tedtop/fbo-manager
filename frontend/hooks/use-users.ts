'use client'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { findAllProfiles } from '@/repositories/profiles.repo'
import { setUserRoles } from '@/repositories/user-roles.repo'
import {
  type InviteUserInput,
  type UpdateUserInput,
  deleteUser,
  inviteUser,
  setStaffEmail,
  setUserActiveStatus,
  updateUserWithRoles
} from '@/services/user-management.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const
}

export function useUsers() {
  const qc = useQueryClient()
  const db = createClient()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? null

  const query = useQuery({
    queryKey: userKeys.lists(),
    queryFn: () => findAllProfiles(db)
  })

  const inviteMutation = useMutation({
    mutationFn: (input: InviteUserInput) => inviteUser(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: ({
      userId,
      input
    }: { userId: string; input: UpdateUserInput }) =>
      updateUserWithRoles(db, userId, input, currentUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all })
  })

  const setRolesMutation = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: number[] }) =>
      setUserRoles(db, userId, roleIds, currentUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all })
  })

  const setStatusMutation = useMutation({
    mutationFn: ({
      userId,
      status
    }: { userId: string; status: 'active' | 'disabled' }) =>
      setUserActiveStatus(db, userId, status, currentUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all })
  })

  const setEmailMutation = useMutation({
    mutationFn: ({
      userId,
      email,
      linkFromUserId
    }: { userId: string; email: string; linkFromUserId?: string }) =>
      setStaffEmail(userId, email, linkFromUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all })
  })

  return {
    users: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    inviteUser: (input: InviteUserInput) => inviteMutation.mutateAsync(input),
    updateUser: (userId: string, input: UpdateUserInput) =>
      updateMutation.mutateAsync({ userId, input }),
    /** Replace a user's roles (the quick promote / change-role control on the Users page). */
    setUserRoles: (userId: string, roleIds: number[]) =>
      setRolesMutation.mutateAsync({ userId, roleIds }),
    setUserStatus: (userId: string, status: 'active' | 'disabled') =>
      setStatusMutation.mutateAsync({ userId, status }),
    deleteUser: (userId: string) => deleteMutation.mutateAsync(userId),
    /** B78: real email on a staff account; linkFromUserId removes the Awaiting-access Google sign-up first. */
    setStaffEmail: (userId: string, email: string, linkFromUserId?: string) =>
      setEmailMutation.mutateAsync({ userId, email, linkFromUserId }),
    refetch: query.refetch
  }
}
