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
import { PG_UNIQUE_VIOLATION } from '@/lib/db-errors'
import { AREA_KINDS, KIND_META, type ParkingAreaKind } from '@/lib/parking-map'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import { useEffect, useState } from 'react'

export type AreaFormValues = {
  code: string
  name: string
  kind: ParkingAreaKind
}

interface AreaSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The area being edited, or null to create a new one. */
  area: ParkingAreaRow | null
  onSubmit: (values: AreaFormValues) => Promise<void>
}

function submitErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    if ((err as { code: unknown }).code === PG_UNIQUE_VIOLATION) {
      return 'Another area already uses that code. Pick a different one.'
    }
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'Could not save the area.'
}

export function AreaSheet({
  open,
  onOpenChange,
  area,
  onSubmit
}: AreaSheetProps) {
  const isEdit = area !== null
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ParkingAreaKind>('ramp')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCode(area?.code ?? '')
    setName(area?.name ?? '')
    setKind(area?.kind ?? 'ramp')
    setError(null)
    setSaving(false)
  }, [open, area])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = { code: code.trim(), name: name.trim(), kind }
    if (!values.code || !values.name) {
      setError('Code and name are both required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } catch (err) {
      setError(submitErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{isEdit ? 'Edit Area' : 'Create Area'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Change how this area is named and listed.'
              : 'Name the area first, then draw its boundary on the map.'}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-2">
              <Label htmlFor="area-code">Code</Label>
              <Input
                id="area-code"
                value={code}
                maxLength={50}
                placeholder="e.g. R1, GH, TD-3"
                onChange={(e) => setCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Short label shown on the map. Must be unique.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="area-name">Name</Label>
              <Input
                id="area-name"
                value={name}
                placeholder="e.g. Main ramp, Gold hangars"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area-kind">Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as ParkingAreaKind)}
              >
                <SelectTrigger id="area-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREA_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
