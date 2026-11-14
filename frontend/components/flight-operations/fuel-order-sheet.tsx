'use client'

import { HelpButton } from '@/components/docs/help-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { TimeInput } from '@/components/ui/time-input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { flightFuelOrderKey } from '@/hooks/use-flight-fuel-order'
import { useToast } from '@/hooks/use-toast'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { describeError } from '@/lib/error-message'
import {
  formFromOrder,
  parseFuelForm,
  type CardFuelType,
  type FlightFuelOrder,
  type FuelSheetForm
} from '@/lib/flight-fuel-order'
import { createClient } from '@/lib/supabase/client'
import {
  cancelFuelOrder,
  editFlightFuelOrder,
  requestFlightFuel
} from '@/services/fuel-orders.service'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

interface FuelOrderSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flightId: number
  tailNumber: string
  /** The flight's scheduled time, so "time wanted" lands on that day. Falls back to now. */
  referenceTime?: string
  /** IANA zone the board shows; "time wanted" is read and shown in it. */
  zone: string
  /** The flight's open order to edit, or null to create a new one. */
  order: FlightFuelOrder | null
}

/**
 * The card's one "Fuel" action (D25): creates the flight's fuel order (source `flight_card`) or, while the order is
 * still open, edits it or cancels it with a reason.
 */
export function FuelOrderSheet({
  open,
  onOpenChange,
  flightId,
  tailNumber,
  referenceTime,
  zone,
  order
}: FuelOrderSheetProps) {
  const db = useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState<FuelSheetForm>(() => formFromOrder(order, zone))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const isEdit = order !== null

  // Start from the order (or defaults) each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setForm(formFromOrder(order, zone))
    setError(null)
    setCancelling(false)
    setReason('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open or when another order is shown
  }, [open, order?.id])

  const refresh = () => qc.invalidateQueries({ queryKey: flightFuelOrderKey(flightId) })

  const fail = (err: unknown) => {
    setError(
      err instanceof ConcurrencyConflictError
        ? 'The order was changed by someone else. Close this sheet and check the latest.'
        : describeError(err, 'Could not save the fuel order.')
    )
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseFuelForm(form, referenceTime ? new Date(referenceTime) : new Date(), zone)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (order) await editFlightFuelOrder(db, order.id, parsed.fields)
      else await requestFlightFuel(db, { flightId, tailNumber, fields: parsed.fields })
      await refresh()
      toast({ title: isEdit ? `Fuel order updated for ${tailNumber}` : `Fuel requested for ${tailNumber}` })
      onOpenChange(false)
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  const cancelOrder = async () => {
    if (!order) return
    if (!reason.trim()) {
      setError('Enter a reason to cancel the fuel order.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await cancelFuelOrder(db, order.id, reason)
      await refresh()
      toast({ title: `Fuel order cancelled for ${tailNumber}` })
      onOpenChange(false)
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="fuel-sheet"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-1">
            {isEdit ? 'Edit fuel order' : 'Fuel'} · {tailNumber}
            <HelpButton module="flight-operations" anchor="fuel" topic="Request fuel from the card" />
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Change the request, or cancel it with a reason.'
              : 'Request fuel for this flight. Line staff see it on the fuel board.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={save} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {error && (
              <div
                role="alert"
                data-testid="fuel-error"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.topOff ? 'topoff' : 'gallons'}
                onValueChange={(v) => v && setForm({ ...form, topOff: v === 'topoff' })}
                className="w-full"
              >
                <ToggleGroupItem value="gallons" className="flex-1" data-testid="fuel-amount-gallons">
                  Gallons
                </ToggleGroupItem>
                <ToggleGroupItem value="topoff" className="flex-1" data-testid="fuel-amount-topoff">
                  Top off
                </ToggleGroupItem>
              </ToggleGroup>
              {!form.topOff && (
                <Input
                  id="fuel-gallons"
                  data-testid="fuel-gallons"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  aria-label="Gallons"
                  placeholder="Gallons wanted"
                  value={form.gallons}
                  onChange={(e) => setForm({ ...form, gallons: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Fuel type</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.fuelType}
                onValueChange={(v) => v && setForm({ ...form, fuelType: v as CardFuelType })}
                className="w-full"
              >
                <ToggleGroupItem value="jet_a" className="flex-1" data-testid="fuel-type-jet_a">
                  Jet A
                </ToggleGroupItem>
                <ToggleGroupItem value="avgas_100" className="flex-1" data-testid="fuel-type-avgas_100">
                  Avgas 100LL
                </ToggleGroupItem>
              </ToggleGroup>
              {form.fuelType === 'jet_a' && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="fuel-prist"
                    data-testid="fuel-prist"
                    checked={form.prist}
                    onCheckedChange={(v) => setForm({ ...form, prist: v === true })}
                  />
                  <Label htmlFor="fuel-prist">Prist</Label>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-time">Time wanted (optional)</Label>
              <TimeInput
                id="fuel-time"
                data-testid="fuel-time"
                value={form.time}
                onChange={(time) => setForm({ ...form, time })}
                placeholder="HH:mm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel-note">Note (optional)</Label>
              <Input
                id="fuel-note"
                data-testid="fuel-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="e.g. tabs, 50 per side"
              />
            </div>

            {isEdit && (
              <div className="space-y-2 border-t border-border pt-4">
                {cancelling ? (
                  <>
                    <Label htmlFor="fuel-cancel-reason">Reason for cancelling</Label>
                    <Input
                      id="fuel-cancel-reason"
                      data-testid="fuel-cancel-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. customer changed plans"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={saving}
                        data-testid="fuel-cancel-confirm"
                        onClick={cancelOrder}
                        className="flex-1"
                      >
                        Cancel fuel order
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => setCancelling(false)}
                        className="flex-1"
                      >
                        Keep order
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="fuel-cancel-start"
                    onClick={() => setCancelling(true)}
                    className="w-full text-destructive"
                  >
                    Cancel this order
                  </Button>
                )}
              </div>
            )}
          </div>

          <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button type="submit" disabled={saving} data-testid="fuel-save" className="w-full sm:w-auto">
              {saving ? 'Saving...' : isEdit ? 'Update order' : 'Request fuel'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
