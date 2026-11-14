'use client'

import {
  isPlaceholderEmail,
  StaffEmailDialog,
  type StaffEmailDialogState
} from '@/components/users/staff-email-dialog'
import {
  EmailChangeDialog,
  type EmailChangeState
} from '@/components/users/email-change-dialog'
import {
  type CellState,
  InlineCell,
  type Nav
} from '@/components/users/inline-cell'
import { type UserFormData, UserSheet } from '@/components/users/user-sheet'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useModuleAccess } from '@/hooks/use-permissions'
import { useRoles } from '@/hooks/use-roles'
import { displayPhone } from '@/lib/phone-mask'
import { displayRoles } from '@/lib/role-rules'
import {
  INLINE_FIELDS,
  type InlineField,
  type InlineValue,
  buildInlinePatch,
  checkInlineEmail,
  draftDisplay,
  inlineInitial,
  isUnchanged
} from '@/lib/user-inline-edit'
import {
  DEFAULT_USER_SORT,
  type UserSort,
  type UserSortKey,
  nextSort,
  sortUsers
} from '@/lib/user-sort'
import { useUsers } from '@/hooks/use-users'
import {
  ADMIN_ROLE_NAME,
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
import { ArrowDown, ArrowUp, ChevronsUpDown, MoreHorizontal } from 'lucide-react'
import { HelpButton } from '@/components/docs/help-button'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

/** Start date when an admin has set one, else the sign-up date. Date-only strings are formatted as written so no time zone shifts the day. */
function formatJoined(user: { hire_date: string | null; created_at: string }): string {
  if (user.hire_date) {
    const [y, m, d] = user.hire_date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString()
  }
  return new Date(user.created_at).toLocaleDateString()
}

/** A role-less account on a real email: someone who signed in themselves, not a seeded staff account. */
const isGoogleSignup = (u: ProfileWithRoles) =>
  isAwaitingAccess(u) && !isPlaceholderEmail(u.email)

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
    setStaffEmail,
    updateUserFields,
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

  // Starts on the default (Name, ascending, by the user_name_sort setting); a header click overrides it for this visit.
  const [sortOverride, setSortOverride] = useState<UserSort | null>(null)
  const sort = sortOverride ?? DEFAULT_USER_SORT
  const { settings } = useAppSettings()
  const [editing, setEditing] = useState<{ id: string; field: InlineField } | null>(null)
  const [cellStates, setCellStates] = useState<Record<string, CellState & { draft?: InlineValue; display?: string }>>({})
  const [emailChange, setEmailChange] = useState<EmailChangeState | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ProfileWithRoles | null>(null)
  const [emailDialog, setEmailDialog] = useState<StaffEmailDialogState | null>(null)
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
    return sortUsers(users, sort, settings.userNameSort).filter((u) => {
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
          `${u.first_name} ${u.last_name} ${u.email} ${u.phone_number ?? ''} ${u.employee_id ?? ''} ${u.badge_id ?? ''} ${u.initials ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [users, sort, settings.userNameSort, search, statusFilter, roleFilter])

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
        initials: data.initials,
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
        initials: data.initials,
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

  const handleSetStaffEmail = async (
    staffId: string,
    email: string,
    linkFromUserId?: string
  ) => {
    await setStaffEmail(staffId, email, linkFromUserId)
    showSuccess(
      linkFromUserId
        ? 'Linked. They can now sign in with Google once more.'
        : `Email set to ${email.trim().toLowerCase()}. They can now Continue with Google.`
    )
  }

  const isAdmin = !!users
    .find((u) => u.id === currentUserId)
    ?.roles.some((r) => r.name === ADMIN_ROLE_NAME)

  /** Email is the sign-in identity: only an administrator, never on their own row, never on a Google sign-up (that one is linked instead). */
  const emailEditable = useCallback(
    (u: ProfileWithRoles) => isAdmin && u.id !== currentUserId && !isGoogleSignup(u),
    [isAdmin, currentUserId]
  )

  const setCell = (key: string, state: (CellState & { draft?: InlineValue; display?: string }) | null) =>
    setCellStates((prev) => {
      const next = { ...prev }
      if (state) next[key] = state
      else delete next[key]
      return next
    })

  /** Move the editor to the next / previous editable cell in row order. */
  const moveFrom = (userId: string, field: InlineField, nav: Nav) => {
    if (nav === 'none') {
      setEditing(null)
      return
    }
    const cells: { id: string; field: InlineField }[] = []
    for (const u of filteredUsers)
      for (const f of INLINE_FIELDS) if (f !== 'email' || emailEditable(u)) cells.push({ id: u.id, field: f })
    const i = cells.findIndex((c) => c.id === userId && c.field === field)
    const target = cells[i + (nav === 'next' ? 1 : -1)]
    setEditing(target ?? null)
  }

  const handleInlineCommit = (
    user: ProfileWithRoles,
    field: InlineField,
    value: InlineValue,
    nav: Nav
  ): string | null => {
    const key = `${user.id}:${field}`
    if (isUnchanged(user, field, value)) {
      setCell(key, null)
      moveFrom(user.id, field, nav)
      return null
    }
    if (field === 'email') {
      const check = checkInlineEmail(value as string, user.email)
      if (!check.ok) return check.error
      setEmailChange({
        userId: user.id,
        name: `${user.first_name} ${user.last_name}`.trim() || user.email,
        currentEmail: user.email,
        email: check.email
      })
      moveFrom(user.id, field, nav)
      return null
    }
    const built = buildInlinePatch(field, value)
    if (!built.ok) return built.error
    setCell(key, { status: 'saving', draft: value, display: draftDisplay(field, value) })
    moveFrom(user.id, field, nav)
    updateUserFields(user.id, built.patch)
      .then(() => {
        setCell(key, { status: 'saved' })
        setTimeout(() => setCellStates((prev) => (prev[key]?.status === 'saved' ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)) : prev)), 2000)
      })
      .catch((err) =>
        setCell(key, {
          status: 'error',
          draft: value,
          display: draftDisplay(field, value),
          message: err instanceof Error ? err.message : 'Could not save'
        })
      )
    return null
  }

  const confirmEmailChange = async (userId: string, email: string) => {
    await setStaffEmail(userId, email)
    showSuccess(`Email set to ${email}. They can now Continue with Google.`)
  }

  const sortHead = (key: UserSortKey, label: string) => {
    const active = sort.key === key
    const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => setSortOverride((cur) => nextSort(cur ?? DEFAULT_USER_SORT, key))}
          className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-sort={key}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? 'text-foreground' : 'text-muted-foreground/60'}`} />
        </button>
      </TableHead>
    )
  }

  /** One editable cell; shows the pending value while a save is in flight or has failed. */
  const cell = (
    user: ProfileWithRoles,
    field: InlineField,
    label: string,
    display: React.ReactNode,
    readOnly = false
  ) => {
    const st = cellStates[`${user.id}:${field}`]
    const shown = st && st.status !== 'saved' && st.display !== undefined ? (st.display || '—') : display
    return (
      <InlineCell
        userId={user.id}
        field={field}
        label={label}
        editing={editing?.id === user.id && editing.field === field}
        readOnly={readOnly}
        display={shown}
        initial={st?.draft ?? inlineInitial(user, field)}
        state={st}
        onStart={() => setEditing({ id: user.id, field })}
        onCancel={() => setEditing(null)}
        onCommit={(v, nav) => handleInlineCommit(user, field, v, nav)}
      />
    )
  }

  // Staff accounts still on a placeholder email: the targets for "Link to staff account".
  const staffCandidates = users.filter(
    (u) =>
      u.id !== currentUserId &&
      isPlaceholderEmail(u.email)
  )

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">Users</h1>
            <HelpButton module="users" topic="Manage Users guide" className="size-8" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            New sign-ups appear here with no role. Pick a role to give them access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                  {sortHead('name', 'Name')}
                  {sortHead('email', 'Email')}
                  {sortHead('phone', 'Phone')}
                  {sortHead('role', 'Role')}
                  {sortHead('joined', 'Joined')}
                  {sortHead('employee_id', 'Employee ID')}
                  {sortHead('badge_id', 'Badge ID')}
                  {sortHead('status', 'Status')}
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-foreground">
                      {cell(
                        user,
                        'name',
                        `name of ${user.email}`,
                        user.first_name || user.last_name ? (
                          `${user.first_name} ${user.last_name}`.trim()
                        ) : (
                          <span className="text-muted-foreground italic">
                            No name yet
                          </span>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cell(user, 'email', `email of ${user.first_name || user.email}`, user.email, !emailEditable(user))}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {cell(user, 'phone', `phone of ${user.email}`, displayPhone(user.phone_number) || '—')}
                    </TableCell>
                    <TableCell>
                      {displayRoles(user.roles).length > 1 ? (
                        <div className="flex flex-wrap gap-1">
                          {displayRoles(user.roles).map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Select
                          value={
                            displayRoles(user.roles)[0]
                              ? String(displayRoles(user.roles)[0].id)
                              : 'none'
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
                      {cell(user, 'hire_date', `start date of ${user.email}`, formatJoined(user))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cell(user, 'employee_id', `employee ID of ${user.email}`, user.employee_id || '—')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cell(user, 'badge_id', `badge ID of ${user.email}`, user.badge_id || '—')}
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
                          {user.id !== currentUserId && (
                            <DropdownMenuItem
                              onClick={() =>
                                setEmailDialog(
                                  isGoogleSignup(user)
                                    ? { mode: 'link', signup: user }
                                    : { mode: 'set', staff: user }
                                )
                              }
                            >
                              {isGoogleSignup(user)
                                ? 'Link to staff account'
                                : 'Set real email'}
                            </DropdownMenuItem>
                          )}
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

      <StaffEmailDialog
        state={emailDialog}
        staffCandidates={staffCandidates}
        onClose={() => setEmailDialog(null)}
        onSet={handleSetStaffEmail}
      />

      <EmailChangeDialog
        state={emailChange}
        onClose={() => setEmailChange(null)}
        onConfirm={confirmEmailChange}
      />

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
