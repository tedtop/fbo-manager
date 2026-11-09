'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMaintenanceItems } from '@/hooks/use-equipment-maintenance'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ErrorMessage } from '@/messages/error-message'
import type { EquipmentStatus } from './status-badge'

type Pending = { id: number; name: string } | null

/** Creates the open maintenance item that says why a truck is down; the dialog lives under the equipment id it is asked for. */
function ReasonDialog({ pending, onDone, onCancel, setStatus }: {
  pending: { id: number; name: string }
  onDone: () => void
  onCancel: () => void
  setStatus: (id: number, status: EquipmentStatus) => Promise<unknown>
}) {
  const { create } = useMaintenanceItems(pending.id)
  const { user } = useCurrentUser()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setError('Say why it is out of service.')
    setSaving(true)
    try {
      await create({ equipment_id: pending.id, title: reason.trim(), noted_by: user?.id ?? null })
      await setStatus(pending.id, 'out_of_service')
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" data-testid="out-of-service-form">
          <DialogHeader>
            <DialogTitle>Take {pending.name} out of service</DialogTitle>
            <DialogDescription>This adds an open maintenance item with the reason. Resolving it later offers to put the truck back in service.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="oos-reason">Reason</Label>
            <Input id="oos-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Dead battery" maxLength={120} autoFocus />
          </div>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="out-of-service-save">Out of service</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Status changes for the equipment list and detail page: every status applies at once except Out of Service, which first
 * asks for the reason and files it as an open maintenance item (shown on the card while the truck is down).
 */
export function useStatusChange(setStatus: (id: number, status: EquipmentStatus) => Promise<unknown>) {
  const [pending, setPending] = useState<Pending>(null)

  const requestStatus = (eq: { id: number; equipment_name: string; status: string }, next: EquipmentStatus) => {
    if (next === eq.status) return
    if (next === 'out_of_service') setPending({ id: eq.id, name: eq.equipment_name })
    else void setStatus(eq.id, next)
  }

  const dialog = pending ? (
    <ReasonDialog pending={pending} setStatus={setStatus} onCancel={() => setPending(null)} onDone={() => setPending(null)} />
  ) : null

  return { requestStatus, dialog }
}
