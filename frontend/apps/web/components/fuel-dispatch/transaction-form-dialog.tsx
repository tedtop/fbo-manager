'use client'

import type {
  FuelTransactionCreateRequest,
  FuelTransactionDetail,
  ProgressEnum
} from '@frontend/types/api'
import { Button } from '@frontend/ui/components/ui/button'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@frontend/ui/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@frontend/ui/components/ui/sheet'
import { useEffect, useState } from 'react'
import { useFlights } from '../../hooks/use-flights'

interface TransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: FuelTransactionDetail | null
  onSubmit: (data: FuelTransactionCreateRequest) => Promise<void>
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  onSubmit
}: TransactionFormDialogProps) {
  const { flights } = useFlights()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FuelTransactionCreateRequest>({
    ticket_number: '',
    flight: null,
    quantity_gallons: '',
    quantity_lbs: '',
    density: '',
    charge_flags: null
  })

  useEffect(() => {
    if (transaction) {
      setFormData({
        ticket_number: transaction.ticket_number,
        flight: transaction.flight,
        quantity_gallons: transaction.quantity_gallons,
        quantity_lbs: transaction.quantity_lbs,
        density: transaction.density,
        charge_flags: transaction.charge_flags
      })
    } else {
      setFormData({
        ticket_number: '',
        flight: null,
        quantity_gallons: '',
        quantity_lbs: '',
        density: '',
        charge_flags: null
      })
    }
  }, [transaction, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(formData)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  // Auto-calculate density when gallons and lbs are provided
  useEffect(() => {
    if (formData.quantity_gallons && formData.quantity_lbs) {
      const gallons = Number.parseFloat(formData.quantity_gallons)
      const lbs = Number.parseFloat(formData.quantity_lbs)
      if (!isNaN(gallons) && !isNaN(lbs) && gallons > 0) {
        const calculatedDensity = (lbs / gallons).toFixed(4)
        if (formData.density !== calculatedDensity) {
          setFormData((prev) => ({ ...prev, density: calculatedDensity }))
        }
      }
    }
  }, [formData.quantity_gallons, formData.quantity_lbs])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>
            {transaction ? 'Edit Transaction' : 'Create Transaction'}
          </SheetTitle>
          <SheetDescription>
            {transaction
              ? 'Update the details for this fuel transaction.'
              : 'Record a new fuel transaction.'}
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-2">
              <Label htmlFor="ticket_number">Ticket Number *</Label>
              <Input
                id="ticket_number"
                value={formData.ticket_number}
                onChange={(e) =>
                  setFormData({ ...formData, ticket_number: e.target.value })
                }
                required
                placeholder="Enter ticket number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="flight">Flight (Optional)</Label>
              <Select
                value={formData.flight?.toString() || 'none'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    flight: value === 'none' ? null : Number.parseInt(value)
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a flight" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No flight assigned</SelectItem>
                  {flights.map((flight) => (
                    <SelectItem key={flight.id} value={flight.id}>
                      {flight.callSign ?? flight.tailNumber} -{' '}
                      {flight.aircraftType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity_gallons">Quantity (Gallons) *</Label>
                <Input
                  id="quantity_gallons"
                  type="number"
                  step="0.01"
                  value={formData.quantity_gallons}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantity_gallons: e.target.value
                    })
                  }
                  required
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity_lbs">Quantity (Lbs) *</Label>
                <Input
                  id="quantity_lbs"
                  type="number"
                  step="0.01"
                  value={formData.quantity_lbs}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity_lbs: e.target.value })
                  }
                  required
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
                value={formData.density}
                onChange={(e) =>
                  setFormData({ ...formData, density: e.target.value })
                }
                placeholder="Auto-calculated"
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                Density is automatically calculated from gallons and lbs
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
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? 'Saving...' : transaction ? 'Update' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
