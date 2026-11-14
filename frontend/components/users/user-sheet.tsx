'use client'

import type { ProfileWithRoles } from '@/types/domain/users'
import type { RoleWithPermissions } from '@/types/domain/users'
import { HelpButton } from '@/components/docs/help-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/users/phone-input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { ErrorMessage } from '@/messages/error-message'
import { ADMIN_ROLE_NAME } from '@/lib/user-guards'
import { isIncludedWithAdmin, normalizeRoleIds } from '@/lib/role-rules'
import { displayPhone, phoneError } from '@/lib/phone-mask'
import { useEffect, useState } from 'react'

export interface UserFormData {
  email: string
  firstName: string
  lastName: string
  phoneNumber: string
  employeeId: string
  badgeId: string
  hireDate: string
  roleIds: number[]
}

const EMPTY_FORM: UserFormData = {
  email: '',
  firstName: '',
  lastName: '',
  phoneNumber: '',
  employeeId: '',
  badgeId: '',
  hireDate: '',
  roleIds: []
}

interface UserSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: ProfileWithRoles | null
  roles: RoleWithPermissions[]
  onSubmit: (data: UserFormData) => Promise<void>
}

export function UserSheet({
  open,
  onOpenChange,
  user,
  roles,
  onSubmit
}: UserSheetProps) {
  const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (user) {
      setFormData({
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: displayPhone(user.phone_number),
        employeeId: user.employee_id ?? '',
        badgeId: user.badge_id ?? '',
        hireDate: user.hire_date ?? '',
        roleIds: user.roles.map((r) => r.id)
      })
    } else {
      setFormData(EMPTY_FORM)
    }
  }, [user, open])

  const toggleRole = (roleId: number) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId]
    }))
  }

  const adminRoleId = roles.find((r) => r.name === ADMIN_ROLE_NAME)?.id
  const isAdminPicked = adminRoleId !== undefined && formData.roleIds.includes(adminRoleId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // A legacy value that was not a 10-digit number may stay as it was; anything the admin changes must be a full number.
    const phoneProblem =
      formData.phoneNumber !== (user?.phone_number ?? '') && phoneError(formData.phoneNumber)
    if (phoneProblem) {
      setError(phoneProblem)
      return
    }
    setLoading(true)
    try {
      await onSubmit({ ...formData, roleIds: normalizeRoleIds(roles, formData.roleIds) })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{user ? 'Edit User' : 'Invite User'}</SheetTitle>
          <SheetDescription>
            {user
              ? 'Update this person’s details and role assignments.'
              : 'An email invitation will be sent so they can set their own password.'}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              disabled={!!user}
              placeholder="name@example.com"
            />
            {user && (
              <p className="text-xs text-muted-foreground">
                Email cannot be changed here.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <PhoneInput
              id="phoneNumber"
              value={formData.phoneNumber}
              onValueChange={(phoneNumber) =>
                setFormData({ ...formData, phoneNumber })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee ID</Label>
              <Input
                id="employeeId"
                value={formData.employeeId}
                onChange={(e) =>
                  setFormData({ ...formData, employeeId: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Printed on the front of the airport badge.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="badgeId">Badge ID</Label>
              <Input
                id="badgeId"
                value={formData.badgeId}
                onChange={(e) =>
                  setFormData({ ...formData, badgeId: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Small number on the back of the badge. The airport needs it
                once a year.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hireDate">Start date</Label>
            <Input
              id="hireDate"
              type="date"
              value={formData.hireDate}
              onChange={(e) =>
                setFormData({ ...formData, hireDate: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              The day they started at Minuteman, shown as Joined and used for
              work anniversaries.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1 text-sm font-medium leading-none">
              Roles
              <HelpButton module="users" anchor="roles" topic="Roles" className="size-5" />
            </legend>
            <p className="text-xs text-muted-foreground">
              Roles decide which modules this person can open. Pick one or
              more.
            </p>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No roles exist yet. Create one under Users &rarr; Roles.
              </p>
            ) : (
              <div className="space-y-2">
                {roles.map((role) => {
                  const inputId = `role-${role.id}`
                  const included = isAdminPicked && isIncludedWithAdmin(role.name)
                  const selected = included || formData.roleIds.includes(role.id)
                  return (
                    <label
                      key={role.id}
                      htmlFor={inputId}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                        included
                          ? 'cursor-not-allowed opacity-70'
                          : 'cursor-pointer hover:bg-accent/40'
                      } ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <Checkbox
                        id={inputId}
                        checked={selected}
                        onCheckedChange={() => toggleRole(role.id)}
                        disabled={included}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {role.name}
                          {included && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              Included with Administrator
                            </span>
                          )}
                        </span>
                        {role.description && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {role.description}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>

          <SheetFooter className="mt-auto flex-row justify-end gap-2 px-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : user ? 'Save Changes' : 'Send Invite'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
