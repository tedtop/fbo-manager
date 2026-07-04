'use client'

import { createClient } from '@/lib/supabase/client'
import {
  findActiveDepartments,
  findDepartmentBySlug,
  findActiveMembers,
} from '@/repositories/departments.repo'
import { useQuery } from '@tanstack/react-query'

export const departmentKeys = {
  all: ['departments'] as const,
  bySlug: (slug: string) => [...departmentKeys.all, 'slug', slug] as const,
  members: (deptId: number) => [...departmentKeys.all, deptId, 'members'] as const,
}

export function useDepartments() {
  const db = createClient()
  const query = useQuery({
    queryKey: departmentKeys.all,
    queryFn: () => findActiveDepartments(db),
    staleTime: 5 * 60 * 1000,
  })
  return { departments: query.data ?? [], loading: query.isLoading }
}

export function useDepartment(slug: string) {
  const db = createClient()

  const deptQuery = useQuery({
    queryKey: departmentKeys.bySlug(slug),
    queryFn: () => findDepartmentBySlug(db, slug),
    staleTime: 5 * 60 * 1000,
  })

  const department = deptQuery.data ?? null

  const membersQuery = useQuery({
    queryKey: departmentKeys.members(department?.id ?? -1),
    queryFn: () => findActiveMembers(db, department!.id),
    enabled: !!department,
    staleTime: 60 * 1000,
  })

  return {
    department,
    members: membersQuery.data ?? [],
    loading: deptQuery.isLoading || membersQuery.isLoading,
    error: deptQuery.error ?? membersQuery.error,
  }
}
