'use client'

import { type UserFormData, UserSheet } from '@/components/users/user-sheet'
import { useModuleAccess } from '@/hooks/use-permissions'
import { useRoles } from '@/hooks/use-roles'
import { useUsers } from '@/hooks/use-users'
import type { ProfileWithRoles } from '@/types/domain/users'
import { Badge } from '@frontend/ui/components/ui/badge'
import { Button } from '@frontend/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@frontend/ui/components/ui/dropdown-menu'
import { Input } from '@frontend/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@frontend/ui/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@frontend/ui/components/ui/table'
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { SuccessMessage } from '@frontend/ui/messages/success-message'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function UsersPage() {
  const { allowed, loading: accessLoading } = useModuleAccess('users', 'manage')
  const {
    users,
    loading,
    error,
    inviteUser,
    updateUser,
    setUserStatus,
    deleteUser,
    refetch
  } = useUsers()
  const { roles } = useRoles()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'disabled'
  >('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ProfileWithRoles | null>(null)
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

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (
        roleFilter !== 'all' &&
        !u.roles.some((r) => String(r.id) === roleFilter)
      )
        return false
      if (search) {
        const q = search.toLowerCase()
        const haystack =
          `${u.first_name} ${u.last_name} ${u.email} ${u.employee_id ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [users, search, statusFilter, roleFilter])

  const handleSubmit = async (data: UserFormData) => {
    if (editingUser) {
      await updateUser(editingUser.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        employeeId: data.employeeId,
        roleIds: data.roleIds
      })
      showSuccess('User updated')
    } else {
      await inviteUser({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        employeeId: data.employeeId,
        roleIds: data.roleIds
      })
      showSuccess(`Invitation sent to ${data.email}`)
    }
    refetch()
  }

  const handleToggleStatus = async (user: ProfileWithRoles) => {
    const next = user.status === 'active' ? 'disabled' : 'active'
    try {
      await setUserStatus(user.id, next)
      showSuccess(next === 'active' ? 'User reactivated' : 'User deactivated')
    } catch {
      showError('Failed to update user status')
    }
  }

  const handleDelete = async (user: ProfileWithRoles) => {
    if (
      !confirm(
        `Permanently delete ${user.first_name} ${user.last_name}? This cannot be undone.`
      )
    ) {
      return
    }
    try {
      await deleteUser(user.id)
      showSuccess('User deleted')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  if (accessLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading users...</div>
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
          You do not have permission to manage users. Contact an administrator
          if you believe this is a mistake.
        </p>
      </div>
    )
  }

  const activeCount = users.filter((u) => u.status === 'active').length
  const disabledCount = users.filter((u) => u.status === 'disabled').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage staff accounts, roles, and module access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/users/roles">Roles &amp; Permissions</Link>
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setEditingUser(null)
              setSheetOpen(true)
            }}
          >
            Invite User
          </Button>
        </div>
      </div>

      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
      {error && <ErrorMessage>Failed to load users</ErrorMessage>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Total Users
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {users.length}
          </div>
        </div>
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Active
          </div>
          <div className="mt-2 text-3xl font-bold text-success">
            {activeCount}
          </div>
        </div>
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Disabled
          </div>
          <div className="mt-2 text-3xl font-bold text-muted-foreground">
            {disabledCount}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name, email, or employee ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={String(role.id)}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg bg-card shadow border border-border overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-muted-foreground">
              {users.length === 0
                ? 'No users found. Invite someone to get started.'
                : 'No users match your search or filters.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-foreground">
                      {user.first_name || user.last_name ? (
                        `${user.first_name} ${user.last_name}`.trim()
                      ) : (
                        <span className="text-muted-foreground italic">
                          Pending signup
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      {user.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No roles
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.employee_id || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.status === 'active' ? 'default' : 'outline'
                        }
                      >
                        {user.status === 'active' ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingUser(user)
                              setSheetOpen(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(user)}
                          >
                            {user.status === 'active'
                              ? 'Deactivate'
                              : 'Reactivate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(user)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <UserSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        user={editingUser}
        roles={roles}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
