'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ErrorMessage } from '@/messages/error-message'
import { useEffect, useState } from 'react'

export interface EmailChangeState {
  userId: string
  name: string
  currentEmail: string
  email: string
}

interface Props {
  state: EmailChangeState | null
  onClose: () => void
  onConfirm: (userId: string, email: string) => Promise<void>
}

/** B107: the confirm step before an inline email edit. The email is the sign-in identity, so this goes through Set real email. */
export function EmailChangeDialog({ state, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setBusy(false)
    setError('')
  }, [state])

  if (!state) return null

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm(state.userId, state.email)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change sign-in email</DialogTitle>
          <DialogDescription>
            This changes how {state.name} signs in. {state.currentEmail} becomes {state.email}. Their
            current password stops working, so they sign in with Continue with Google using the new
            address. Their role, shifts and history stay.
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? 'Changing…' : 'Change email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
