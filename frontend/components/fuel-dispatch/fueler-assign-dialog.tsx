'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useFuelers } from '@/hooks/use-fuelers'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface FuelerAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignedFuelerIds: number[]
  onAssign: (fuelerId: number) => Promise<void>
  onRemove: (fuelerId: number) => Promise<void>
}

export function FuelerAssignDialog({
  open,
  onOpenChange,
  assignedFuelerIds,
  onAssign,
  onRemove
}: FuelerAssignDialogProps) {
  const { fuelers, loading } = useFuelers(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async (fuelerId: number) => {
    setSaving(fuelerId)
    setError(null)
    try {
      if (assignedFuelerIds.includes(fuelerId)) {
        await onRemove(fuelerId)
      } else {
        await onAssign(fuelerId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Fuelers</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading fuelers...</div>
          ) : fuelers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No active fuelers found.</div>
          ) : (
            fuelers.map((fueler) => {
              const isAssigned = assignedFuelerIds.includes(fueler.id)
              return (
                <button
                  key={fueler.id}
                  onClick={() => handleToggle(fueler.id)}
                  disabled={saving === fueler.id}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-all',
                    isAssigned
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-card border-border hover:border-primary/40'
                  )}
                >
                  <span className="font-medium">{fueler.fueler_name}</span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    isAssigned
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {isAssigned ? 'Assigned' : 'Add'}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
