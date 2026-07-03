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
import {
  ToggleGroup,
  ToggleGroupItem
} from '@/components/ui/toggle-group'
import { createClient } from '@/lib/supabase/client'
import { useEquipment } from '@/hooks/use-equipment'
import { useFlights } from '@/hooks/use-flights'
import type { TransactionInsert, TransactionWithRelations } from '@/repositories/transactions.repo'
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

type FuelType = 'jet_a' | 'jet_a_plus' | 'avgas' | ''

interface TransactionFormData {
  ticket_number: string
  flight_id: number | null
  tail_number: string
  fuel_type: FuelType
  fuel_truck_id: number | null
  fuel_order_text: string
  quantity_gallons: string
  quantity_lbs: string
}

interface TransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: TransactionWithRelations | null
  onSubmit: (data: TransactionInsert) => Promise<void>
  defaultFlightId?: number | null
  defaultTailNumber?: string
}

const emptyForm: TransactionFormData = {
  ticket_number: '',
  flight_id: null,
  tail_number: '',
  fuel_type: '',
  fuel_truck_id: null,
  fuel_order_text: '',
  quantity_gallons: '',
  quantity_lbs: ''
}

const FUEL_OPTIONS: { value: FuelType; label: string }[] = [
  { value: 'jet_a', label: 'Jet A' },
  { value: 'jet_a_plus', label: 'Jet A+' },
  { value: 'avgas', label: 'Avgas' }
]

function generateTicketNumber(seq: number): string {
  const today = format(new Date(), 'yyMMdd')
  return `TKT-${today}-${String(seq).padStart(4, '0')}`
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  onSubmit,
  defaultFlightId,
  defaultTailNumber
}: TransactionFormDialogProps) {
  const db = useMemo(() => createClient(), [])
  const { flights } = useFlights()
  const { equipment } = useEquipment()
  const fuelTrucks = equipment.filter((e) => e.equipment_type === 'fuel_truck')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TransactionFormData>(emptyForm)

  const isEdit = !!transaction

  useEffect(() => {
    if (!open) return
    setError(null)

    if (transaction) {
      setForm({
        ticket_number: transaction.ticket_number,
        flight_id: transaction.flight_id,
        tail_number: transaction.tail_number ?? '',
        fuel_type: transaction.fuel_type ?? '',
        fuel_truck_id: transaction.fuel_truck_id,
        fuel_order_text: transaction.fuel_order_text ?? '',
        quantity_gallons: transaction.quantity_gallons ?? '',
        quantity_lbs: transaction.quantity_lbs ?? ''
      })
      return
    }

    // Auto-generate ticket number for new orders
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    db.from('fuel_transaction')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
      .then(({ count }) => {
        setForm({
          ...emptyForm,
          ticket_number: generateTicketNumber((count ?? 0) + 1),
          flight_id: defaultFlightId ?? null,
          tail_number: defaultTailNumber ?? ''
        })
      })
  }, [open, transaction, defaultFlightId, defaultTailNumber, db])

  const density =
    form.quantity_gallons && form.quantity_lbs
      ? (Number(form.quantity_lbs) / Number(form.quantity_gallons)).toFixed(4)
      : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const gal = form.quantity_gallons ? Number(form.quantity_gallons) : null
      const lbs = form.quantity_lbs ? Number(form.quantity_lbs) : null

      const payload: TransactionInsert = {
        ticket_number: form.ticket_number,
        progress: 'started',
        qt_sync_status: 'pending',
        flight_id: form.flight_id || null,
        tail_number: form.tail_number || null,
        fuel_type: form.fuel_type || null,
        fuel_truck_id: form.fuel_truck_id || null,
        fuel_order_text: form.fuel_order_text || null,
        quantity_gallons: gal,
        quantity_lbs: lbs,
        density: gal && lbs && density ? Number(density) : null,
        source: transaction?.source ?? 'manual',
        charge_flags: undefined
      }
      await onSubmit(payload)
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save transaction:', err)
      const msg =
        err instanceof Error ? err.message :
        typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) :
        String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{isEdit ? 'Edit Fuel Order' : 'New Fuel Order'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the fuel order details.'
              : 'Create a new fuel order for line staff.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ticket_number">Ticket Number *</Label>
              <Input
                id="ticket_number"
                value={form.ticket_number}
                onChange={(e) => setForm({ ...form, ticket_number: e.target.value })}
                required
                placeholder="e.g. TKT-260703-0001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="flight">Flight</Label>
              <Select
                value={form.flight_id?.toString() || 'none'}
                onValueChange={(value) =>
                  setForm({ ...form, flight_id: value === 'none' ? null : Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a flight (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No flight</SelectItem>
                  {flights.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.callSign ?? f.tailNumber} - {f.aircraftType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tail_number">Tail Number</Label>
              <Input
                id="tail_number"
                value={form.tail_number}
                onChange={(e) => setForm({ ...form, tail_number: e.target.value })}
                placeholder="e.g. N12345"
              />
            </div>

            <div className="space-y-2">
              <Label>Fuel Type</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.fuel_type}
                onValueChange={(value) => {
                  if (value) setForm({ ...form, fuel_type: value as FuelType })
                }}
                className="w-full"
              >
                {FUEL_OPTIONS.map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="flex-1 text-sm"
                    aria-label={opt.label}
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel_truck">Fuel Truck</Label>
              <Select
                value={form.fuel_truck_id?.toString() || 'none'}
                onValueChange={(value) =>
                  setForm({ ...form, fuel_truck_id: value === 'none' ? null : Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign a fuel truck (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No truck</SelectItem>
                  {fuelTrucks.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.equipment_id} - {t.equipment_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fuel_order_text">Fuel Request</Label>
              <Input
                id="fuel_order_text"
                value={form.fuel_order_text}
                onChange={(e) => setForm({ ...form, fuel_order_text: e.target.value })}
                placeholder='e.g. "T/O", "panel set", "110/s", "1260", "10000 lbs"'
              />
              <p className="text-xs text-muted-foreground">
                Freeform fuel request. Actual gallons can be entered below or added later.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity_gallons">Gallons</Label>
                <Input
                  id="quantity_gallons"
                  type="number"
                  step="0.01"
                  value={form.quantity_gallons}
                  onChange={(e) => setForm({ ...form, quantity_gallons: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity_lbs">Lbs</Label>
                <Input
                  id="quantity_lbs"
                  type="number"
                  step="0.01"
                  value={form.quantity_lbs}
                  onChange={(e) => setForm({ ...form, quantity_lbs: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="density">Density (lbs/gal)</Label>
              <Input
                id="density"
                type="number"
                step="0.0001"
                value={density}
                placeholder="Auto-calculated"
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                Automatically calculated from gallons and lbs
              </p>
            </div>
          </div>

          <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? 'Saving...' : isEdit ? 'Update Order' : 'Create Order'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
