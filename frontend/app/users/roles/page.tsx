'use client'

import { type RoleFormData, RoleSheet } from '@/components/roles/role-sheet'
import { useModuleAccess } from '@/hooks/use-permissions'
import { useRoles } from '@/hooks/use-roles'
import { MODULES, type RoleWithPermissions } from '@/types/domain/users'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export default function RolesPage() {
  const { allowed, loading: accessLoading } = useModuleAccess('users', 'manage')
  const { roles, loading, error, createRole, updateRole, deleteRole, refetch } =
    useRoles()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(
    null
  )
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }
  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(''), 5000)
  }

  const handleSubmit = async (data: RoleFormData) => {
    if (editingRole) {
      await updateRole(
        editingRole.id,
        { description: data.description },
        data.permissions
      )
      showSuccess('Role updated')
    } else {
      await createRole(
        { name: data.name, description: data.description },
        data.permissions
      )
      showSuccess('Role created')
    }
    refetch()
  }

  const handleDelete = async (role: RoleWithPermissions) => {
    if (role.is_system) return
    if (
      !confirm(
        `Delete the "${role.name}" role? Anyone holding it will lose its access.`
      )
    )
      return
    try {
      await deleteRole(role.id)
      showSuccess('Role deleted')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete role')
    }
  }

  if (accessLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading roles...</div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Access Restricted
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to manage roles.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/users"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Users
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-foreground">
            Roles &amp; Permissions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Define what each role can see and change, per module
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            setEditingRole(null)
            setSheetOpen(true)
          }}
        >
          New Role
        </Button>
      </div>

      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
      {error && <ErrorMessage>Failed to load roles</ErrorMessage>}

      {roles.length === 0 ? (
        <div className="rounded-lg bg-card shadow border border-border p-8 text-center">
          <div className="text-muted-foreground">
            No roles found. Create one to get started.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <div
              key={role.id}
              className="rounded-lg bg-card shadow-sm border border-border p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {role.name}
                    </h2>
                    {role.is_system && (
                      <Badge variant="outline">Built-in</Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRole(role)
                      setSheetOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={role.is_system}
                    title={
                      role.is_system
                        ? 'Built-in roles cannot be deleted'
                        : undefined
                    }
                    onClick={() => handleDelete(role)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {MODULES.map((mod) => {
                  const perm = role.permissions.find(
                    (p) => p.module === mod.key
                  )
                  if (!perm) return null
                  return (
                    <Badge
                      key={mod.key}
                      variant={
                        perm.access_level === 'manage' ? 'default' : 'secondary'
                      }
                    >
                      {mod.label}:{' '}
                      {perm.access_level === 'manage' ? 'Manage' : 'View'}
                    </Badge>
                  )
                })}
                {role.permissions.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No module access granted
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <RoleSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        role={editingRole}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
