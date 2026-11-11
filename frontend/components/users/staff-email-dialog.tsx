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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ErrorMessage } from '@/messages/error-message'
import type { ProfileWithRoles } from '@/types/domain/users'
import { useEffect, useState } from 'react'

/** Seeded staff accounts use first.last@minutemanfbo.local until B78 gives them a real email. */
export const isPlaceholderEmail = (email: string) =>
  email.toLowerCase().endsWith('.local')

const fullName = (u: ProfileWithRoles) =>
  `${u.first_name} ${u.last_name}`.trim() || u.email

export type StaffEmailDialogState =
  /** Admin types the person's real email for this staff account. */
  | { mode: 'set'; staff: ProfileWithRoles }
  /** This Awaiting-access Google sign-up gets merged into a staff account the admin picks. */
  | { mode: 'link'; signup: ProfileWithRoles }

interface Props {
  state: StaffEmailDialogState | null
  /** Accounts that can receive a real email (placeholder-email staff accounts). */
  staffCandidates: ProfileWithRoles[]
  onClose: () => void
  onSet: (staffId: string, email: string, linkFromUserId?: string) => Promise<void>
}

export function StaffEmailDialog({ state, staffCandidates, onClose, onSet }: Props) {
  const [email, setEmail] = useState('')
  const [staffId, setStaffId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEmail('')
    setStaffId('')
    setError('')
    setBusy(false)
  }, [state])

  if (!state) return null

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      if (state.mode === 'set') {
        await onSet(state.staff.id, email)
      } else {
        await onSet(staffId, state.signup.email, state.signup.id)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const target = state.mode === 'set' ? state.staff : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state.mode === 'set' ? 'Set real email' : 'Link to staff account'}
          </DialogTitle>
          <DialogDescription>
            {state.mode === 'set'
              ? `${fullName(state.staff)} keeps their account, role and shifts. This email becomes their login, and their current password stops working. They then sign in with Continue with Google.`
              : `${state.signup.email} signed in with Google and is waiting for access. Pick the staff account they belong to: this new sign-up is deleted, the staff account takes the email, and they sign in with Google once more.`}
          </DialogDescription>
        </DialogHeader>

        {state.mode === 'set' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Current email: {target?.email}
            </p>
            <Label htmlFor="staff-real-email">Real email (their Google address)</Label>
            <Input
              id="staff-real-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gmail.com"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Staff account</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger aria-label="Staff account to link">
                <SelectValue placeholder="Choose a staff account" />
              </SelectTrigger>
              <SelectContent>
                {staffCandidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {fullName(u)} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {staffCandidates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No staff accounts with a placeholder email are left.
              </p>
            )}
          </div>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || (state.mode === 'set' ? !email.trim() : !staffId)}
          >
            {state.mode === 'set' ? 'Set email' : 'Link account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
