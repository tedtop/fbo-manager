'use client'

import type { ProfileWithRoles } from '@/types/domain/users'
import type { RoleWithPermissions } from '@/types/domain/users'
import { Button } from '@frontend/ui/components/ui/button'
import { Checkbox } from '@frontend/ui/components/ui/checkbox'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@frontend/ui/components/ui/sheet'
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { useEffect, useState } from 'react'

export interface UserFormData {
  email: string
  firstName: string
  lastName: string
  phoneNumber: string
  employeeId: string
  roleIds: number[]
}

const EMPTY_FORM: UserFormData = {
  email: '',
  firstName: '',
  lastName: '',
  phoneNumber: '',
  employeeId: '',
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
        phoneNumber: user.phone_number,
        employeeId: user.employee_id ?? '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSubmit(formData)
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) =>
                  setFormData({ ...formData, phoneNumber: e.target.value })
                }
                placeholder="(555) 555-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee ID</Label>
              <Input
                id="employeeId"
                value={formData.employeeId}
                onChange={(e) =>
                  setFormData({ ...formData, employeeId: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No roles exist yet. Create one under Users &rarr; Roles.
              </p>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-3">
                {roles.map((role) => {
                  const inputId = `role-${role.id}`
                  return (
                    <div
                      key={role.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Checkbox
                        id={inputId}
                        checked={formData.roleIds.includes(role.id)}
                        onCheckedChange={() => toggleRole(role.id)}
                      />
                      <Label htmlFor={inputId} className="font-normal">
                        <span className="font-medium text-foreground">
                          {role.name}
                        </span>
                        {role.description && (
                          <span className="block text-xs text-muted-foreground">
                            {role.description}
                          </span>
                        )}
                      </Label>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

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
