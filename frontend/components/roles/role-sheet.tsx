'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ErrorMessage } from '@/messages/error-message'
import {
  type AccessLevel,
  MODULES,
  type ModuleKey,
  type RoleWithPermissions
} from '@/types/domain/users'
import { useEffect, useState } from 'react'

export type PermissionGrid = Partial<Record<ModuleKey, AccessLevel | null>>

export interface RoleFormData {
  name: string
  description: string
  permissions: PermissionGrid
}

function emptyGrid(): PermissionGrid {
  return Object.fromEntries(MODULES.map((m) => [m.key, null])) as PermissionGrid
}

interface RoleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: RoleWithPermissions | null
  onSubmit: (data: RoleFormData) => Promise<void>
}

export function RoleSheet({
  open,
  onOpenChange,
  role,
  onSubmit
}: RoleSheetProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<PermissionGrid>(emptyGrid())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (role) {
      setName(role.name)
      setDescription(role.description)
      const grid = emptyGrid()
      for (const perm of role.permissions) {
        grid[perm.module] = perm.access_level
      }
      setPermissions(grid)
    } else {
      setName('')
      setDescription('')
      setPermissions(emptyGrid())
    }
  }, [role, open])

  const setModuleAccess = (module: ModuleKey, value: string) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: value === 'none' ? null : (value as AccessLevel)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSubmit({ name, description, permissions })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role')
    } finally {
      setLoading(false)
    }
  }

  const isSystemRole = !!role?.is_system

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{role ? 'Edit Role' : 'New Role'}</SheetTitle>
          <SheetDescription>
            Choose the access level this role grants per module. "Manage"
            includes full read/write; "View" is read-only; leave a module unset
            to hide it entirely.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="space-y-2">
            <Label htmlFor="role-name">Role Name *</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSystemRole}
              placeholder="e.g., Ramp Supervisor"
            />
            {isSystemRole && (
              <p className="text-xs text-muted-foreground">
                Built-in role names cannot be changed, but permissions can.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this role is for"
            />
          </div>

          <div className="space-y-2">
            <Label>Module Access</Label>
            <div className="rounded-md border border-border divide-y divide-border">
              {MODULES.map((mod) => (
                <div
                  key={mod.key}
                  className="flex items-center justify-between gap-4 p-3"
                >
                  <span className="text-sm font-medium text-foreground">
                    {mod.label}
                  </span>
                  <Select
                    value={permissions[mod.key] ?? 'none'}
                    onValueChange={(v) => setModuleAccess(mod.key, v)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No access</SelectItem>
                      <SelectItem value="view">View only</SelectItem>
                      <SelectItem value="manage">Manage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
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
              {loading ? 'Saving...' : role ? 'Save Changes' : 'Create Role'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
