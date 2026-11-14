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
import type { TransactionWithRelations } from '@/repositories/transactions.repo'
import { useEffect, useState } from 'react'

interface FillOrderDialogProps {
  transaction: TransactionWithRelations | null
  onOpenChange: (open: boolean) => void
  onFill: (tx: TransactionWithRelations, gallons: number) => Promise<void>
}

/** Asks for the delivered gallons (required, more than zero) before an order is filled. */
export function FillOrderDialog({ transaction, onOpenChange, onFill }: FillOrderDialogProps) {
  const [gallons, setGallons] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!transaction) return
    setGallons(
      transaction.gallons_delivered ??
        transaction.quantity_gallons ??
        transaction.gallons_requested ??
        ''
    )
  }, [transaction])

  const value = Number(gallons)
  const valid = gallons.trim() !== '' && Number.isFinite(value) && value > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transaction || !valid) return
    setSaving(true)
    try {
      await onFill(transaction, value)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={transaction !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Fill order</DialogTitle>
            <DialogDescription>
              {transaction?.tail_number ?? transaction?.ticket_number}: enter the gallons delivered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fill_gallons">Gallons delivered *</Label>
            <Input
              id="fill_gallons"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              autoFocus
              value={gallons}
              onChange={(e) => setGallons(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              Fill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
