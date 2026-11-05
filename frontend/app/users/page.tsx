'use client'

import { type UserFormData, UserSheet } from '@/components/users/user-sheet'
import { useModuleAccess } from '@/hooks/use-permissions'
import { useRoles } from '@/hooks/use-roles'
import { useUsers } from '@/hooks/use-users'
import {
  accountRemovalBlocked,
  isAwaitingAccess,
  roleChangeBlocked
} from '@/lib/user-guards'
import { useAuth } from '@/providers/auth-provider'
import type { ProfileWithRoles } from '@/types/domain/users'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

/** Start date when an admin has set one, else the sign-up date. Date-only strings are formatted as written so no time zone shifts the day. */
function formatJoined(user: { hire_date: string | null; created_at: string }): string {
  if (user.hire_date) {
    const [y, m, d] = user.hire_date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString()
  }
  return new Date(user.created_at).toLocaleDateString()
}

export default function UsersPage() {
  const { allowed, loading: accessLoading } = useModuleAccess('users', 'manage')
  const {
    users,
    loading,
    error,
    inviteUser,
    updateUser,
    setUserStatus,
    setUserRoles,
    deleteUser,
    refetch
  } = useUsers()
  const { roles } = useRoles()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? null

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
    // New sign-ups waiting for a role first, then newest accounts first.
    const ordered = [...users].sort((a, b) => {
      const pending = Number(isAwaitingAccess(b)) - Number(isAwaitingAccess(a))
      return pending || b.created_at.localeCompare(a.created_at)
    })
    return ordered.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (roleFilter === 'none') {
        if (u.roles.length > 0) return false
      } else if (
        roleFilter !== 'all' &&
        !u.roles.some((r) => String(r.id) === roleFilter)
      )
        return false
      if (search) {
        const q = search.toLowerCase()
        const haystack =
          `${u.first_name} ${u.last_name} ${u.email} ${u.employee_id ?? ''} ${u.badge_id ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [users, search, statusFilter, roleFilter])

  const handleSubmit = async (data: UserFormData) => {
    if (editingUser) {
      const blocked = roleChangeBlocked(
        users,
        editingUser.id,
        currentUserId,
        roles.filter((r) => data.roleIds.includes(r.id)).map((r) => r.name)
      )
      if (blocked) throw new Error(blocked)
      await updateUser(editingUser.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        employeeId: data.employeeId,
        badgeId: data.badgeId,
        hireDate: data.hireDate,
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
        badgeId: data.badgeId,
        hireDate: data.hireDate,
        roleIds: data.roleIds
      })
      showSuccess(`Invitation sent to ${data.email}`)
    }
    refetch()
  }

  const handleSetRole = async (user: ProfileWithRoles, value: string) => {
    const role = roles.find((r) => String(r.id) === value)
    const blocked = roleChangeBlocked(
      users,
      user.id,
      currentUserId,
      role ? [role.name] : []
    )
    if (blocked) {
      showError(blocked)
      return
    }
    const name = `${user.first_name} ${user.last_name}`.trim() || user.email
    try {
      await setUserRoles(user.id, role ? [role.id] : [])
      showSuccess(
        role ? `${name} is now ${role.name}` : `${name} no longer has a role`
      )
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to change role')
    }
  }

  const handleToggleStatus = async (user: ProfileWithRoles) => {
    const next = user.status === 'active' ? 'disabled' : 'active'
    if (next === 'disabled') {
      const blocked = accountRemovalBlocked(
        users,
        user.id,
        currentUserId,
        'deactivate'
      )
      if (blocked) {
        showError(blocked)
        return
      }
    }
    try {
      await setUserStatus(user.id, next)
      showSuccess(next === 'active' ? 'User reactivated' : 'User deactivated')
    } catch {
      showError('Failed to update user status')
    }
  }

  const handleDelete = async (user: ProfileWithRoles) => {
    const blocked = accountRemovalBlocked(
      users,
      user.id,
      currentUserId,
      'delete'
    )
    if (blocked) {
      showError(blocked)
      return
    }
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
  const awaitingCount = users.filter(isAwaitingAccess).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            New sign-ups appear here with no role. Pick a role to give them access.
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-card px-4 py-5 shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Total Users
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {users.length}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setRoleFilter((f) => (f === 'none' ? 'all' : 'none'))
          }
          aria-pressed={roleFilter === 'none'}
          className={`rounded-lg bg-card px-4 py-5 text-left shadow-sm border ${
            roleFilter === 'none' ? 'border-primary' : 'border-border'
          }`}
        >
          <div className="text-sm font-medium text-muted-foreground">
            Awaiting access
          </div>
          <div
            className={`mt-2 text-3xl font-bold ${
              awaitingCount > 0 ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            {awaitingCount}
          </div>
        </button>
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
            <SelectItem value="none">No role (awaiting access)</SelectItem>
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
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Badge ID</TableHead>
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
                          No name yet
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      {user.roles.length > 1 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Select
                          value={
                            user.roles[0] ? String(user.roles[0].id) : 'none'
                          }
                          onValueChange={(v) => handleSetRole(user, v)}
                        >
                          <SelectTrigger
                            className="h-8 w-44"
                            aria-label={`Role for ${user.email}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {isAwaitingAccess(user)
                                ? 'Awaiting access'
                                : 'No role'}
                            </SelectItem>
                            {roles.map((role) => (
                              <SelectItem key={role.id} value={String(role.id)}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatJoined(user)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.employee_id || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.badge_id || '—'}
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
