'use client'

import type React from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useAircraft } from '@/hooks/use-aircraft'
import { useEffect, useState } from 'react'
import { TailNumberAutocomplete } from './tail-number-autocomplete'
import type { Flight } from './types'

function calculateGroundTime(
  arrivalTime: string,
  departureTime: string
): string {
  if (!arrivalTime || !departureTime) return 'N/A'

  const [arrHour, arrMin] = arrivalTime.split(':').map(Number)
  const [depHour, depMin] = departureTime.split(':').map(Number)

  let totalMinutes = depHour * 60 + depMin - (arrHour * 60 + arrMin)

  // Handle overnight case (departure is next day)
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60 // Add 24 hours
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes}m`
  }
  return `${hours}h ${minutes}m`
}

interface FlightFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (flight: Flight) => void
  initialData?: Flight
  theme: 'dark' | 'light'
}

export function FlightFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  theme
}: FlightFormDialogProps) {
  const {
    aircraft,
    createAircraft,
    updateAircraft,
    loading: aircraftLoading
  } = useAircraft()
  const [formData, setFormData] = useState<Partial<Flight>>({
    type: 'arrival',
    status: 'scheduled',
    services: [],
    source: 'line-department'
  })
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]) // Separate date state
  const [arrivalTime, setArrivalTime] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [isEditingAircraftType, setIsEditingAircraftType] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialData) {
      setFormData(initialData)

      // Extract date and times from timestamps
      if (initialData.arrivalTime) {
        const arrivalDate = new Date(initialData.arrivalTime)
        setDate(arrivalDate.toISOString().split('T')[0])
        const hours = arrivalDate.getHours().toString().padStart(2, '0')
        const minutes = arrivalDate.getMinutes().toString().padStart(2, '0')
        setArrivalTime(`${hours}:${minutes}`)
      }
      if (initialData.departureTime) {
        const departureDate = new Date(initialData.departureTime)
        // Only set date if we don't have arrival time
        if (!initialData.arrivalTime) {
          setDate(departureDate.toISOString().split('T')[0])
        }
        const hours = departureDate.getHours().toString().padStart(2, '0')
        const minutes = departureDate.getMinutes().toString().padStart(2, '0')
        setDepartureTime(`${hours}:${minutes}`)
      }
    } else {
      setFormData({
        type: 'arrival',
        status: 'scheduled',
        services: [],
        source: 'line-department'
      })
      setDate(new Date().toISOString().split('T')[0])
      setArrivalTime('')
      setDepartureTime('')
    }
  }, [initialData, open])

  const handleTailNumberChange = (
    tailNumber: string,
    aircraftType?: string
  ) => {
    setFormData({
      ...formData,
      tailNumber,
      aircraftType: aircraftType || formData.aircraftType
    })
  }

  const handleCreateNewAircraft = async (tailNumber: string) => {
    try {
      const newAircraft = await createAircraft(tailNumber, 'Unknown')
      setFormData({
        ...formData,
        tailNumber: newAircraft.tail_number,
        aircraftType: newAircraft.aircraft_type_display || 'Unknown'
      })
      setIsEditingAircraftType(true)
    } catch (error) {
      console.error('Failed to create aircraft:', error)
      alert('Failed to create new aircraft. Please try again.')
    }
  }

  const handleAircraftTypeChange = (newType: string) => {
    setFormData({ ...formData, aircraftType: newType })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Construct timestamps from date and time values
    const arrivalTimestamp = arrivalTime
      ? `${date}T${arrivalTime}:00`
      : undefined
    const departureTimestamp = departureTime
      ? `${date}T${departureTime}:00`
      : undefined

    // Validate: must have at least one timestamp, and departure is required
    if (!departureTimestamp && !arrivalTimestamp) {
      alert('Please provide at least one time (arrival or departure)')
      return
    }

    // Ensure aircraft exists or update it
    if (formData.tailNumber) {
      const existingAircraft = aircraft.find(
        (a) =>
          a.tail_number.toLowerCase() === formData.tailNumber?.toLowerCase()
      )

      try {
        if (!existingAircraft) {
          // Create new aircraft if it doesn't exist
          await createAircraft(
            formData.tailNumber,
            formData.aircraftType || 'Unknown'
          )
        } else if (
          formData.aircraftType &&
          existingAircraft.aircraft_type_display !== formData.aircraftType
        ) {
          // Update existing aircraft if type changed
          await updateAircraft(formData.tailNumber, formData.aircraftType)
        }
      } catch (err) {
        console.error('Failed to ensure aircraft exists:', err)
        // We continue anyway; if it failed because it exists, the flight creation might still work.
        // If it failed because of network, flight creation will likely fail too.
      }
    }

    // For arrivals without departure time, set departure 45 minutes after arrival (required by DB)
    let finalDepartureTimestamp = departureTimestamp
    if (!finalDepartureTimestamp && arrivalTimestamp) {
      const arrivalDate = new Date(arrivalTimestamp)
      arrivalDate.setMinutes(arrivalDate.getMinutes() + 45)
      finalDepartureTimestamp = arrivalDate.toISOString().slice(0, 16) // Format: YYYY-MM-DDTHH:mm
    }

    if (!finalDepartureTimestamp) {
      alert('Please provide at least one time (arrival or departure)')
      return
    }

    const flight: Flight = {
      id: initialData?.id || `manual-${Date.now()}`,
      tailNumber: formData.tailNumber || '',
      aircraftType: formData.aircraftType || '',
      type: formData.type as Flight['type'],
      status: formData.status as Flight['status'],
      arrivalTime: arrivalTimestamp,
      departureTime: finalDepartureTimestamp,
      origin: formData.origin,
      destination: formData.destination,
      contactName: formData.contactName,
      contactNotes: formData.contactNotes,
      services: formData.services || [],
      notes: formData.notes,
      source: formData.source || 'line-department',
      duration: 45, // Will be calculated by the type conversion function
      createdBy: initialData?.createdBy || {
        initials: 'USR',
        name: 'User',
        department: 'System'
      },
      createdAt: initialData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    onSubmit(flight)
    onOpenChange(false)
  }

  const services = [
    'fuel',
    'hangar',
    'catering',
    'maintenance',
    'ground_transport'
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>
            {initialData ? 'Edit Flight' : 'Add New Flight'}
          </SheetTitle>
          <SheetDescription>
            {initialData
              ? 'Update this flight’s details.'
              : 'Log a new arrival, departure, or quick turn.'}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tailNumber">Tail Number *</Label>
                <TailNumberAutocomplete
                  value={formData.tailNumber || ''}
                  onChange={handleTailNumberChange}
                  aircraft={aircraft}
                  onCreateNew={handleCreateNewAircraft}
                  disabled={aircraftLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Start typing to search existing aircraft or create new
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="aircraftType">Aircraft Type *</Label>
                <Input
                  id="aircraftType"
                  value={formData.aircraftType || ''}
                  onChange={(e) => handleAircraftTypeChange(e.target.value)}
                  onFocus={() => setIsEditingAircraftType(true)}
                  required
                  placeholder="e.g., Boeing 737, Citation X"
                />
                {isEditingAircraftType && formData.tailNumber && (
                  <p className="text-xs text-blue-500">
                    ✓ This will update the aircraft type for{' '}
                    {formData.tailNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, type: value as Flight['type'] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arrival">Arrival</SelectItem>
                    <SelectItem value="departure">Departure</SelectItem>
                    <SelectItem value="quick_turn">Quick Turn</SelectItem>
                    <SelectItem value="overnight">Overnight</SelectItem>
                    <SelectItem value="long_term">Long Term</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      status: value as Flight['status']
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="en-route">En Route</SelectItem>
                    <SelectItem value="arrived">Arrived</SelectItem>
                    <SelectItem value="departed">Departed</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <Label>Ground Time (24hr) *</Label>
              <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="arrivalTime"
                      className="text-sm text-muted-foreground flex items-center gap-2"
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-success" />
                      Arrival Time
                    </Label>
                    <Input
                      id="arrivalTime"
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      disabled={formData.type === 'departure'}
                      required={
                        formData.type === 'arrival' ||
                        formData.type === 'quick_turn' ||
                        formData.type === 'overnight' ||
                        formData.type === 'long_term'
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="departureTime"
                      className="text-sm text-muted-foreground flex items-center gap-2"
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                      Departure Time
                    </Label>
                    <Input
                      id="departureTime"
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      disabled={formData.type === 'arrival'}
                      required={
                        formData.type === 'departure' ||
                        formData.type === 'quick_turn' ||
                        formData.type === 'overnight' ||
                        formData.type === 'long_term'
                      }
                    />
                  </div>
                </div>

                {arrivalTime && departureTime && (
                  <div className="text-sm text-muted-foreground text-center pt-2 border-t border-border">
                    Ground time:{' '}
                    {calculateGroundTime(arrivalTime, departureTime)}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origin</Label>
                <Input
                  id="origin"
                  value={formData.origin || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, origin: e.target.value })
                  }
                  placeholder="ICAO code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destination</Label>
                <Input
                  id="destination"
                  value={formData.destination || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, destination: e.target.value })
                  }
                  placeholder="ICAO code"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={formData.contactName || ''}
                onChange={(e) =>
                  setFormData({ ...formData, contactName: e.target.value })
                }
                placeholder="Pilot or contact person"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactNotes">Contact Notes</Label>
              <Textarea
                id="contactNotes"
                value={formData.contactNotes || ''}
                onChange={(e) =>
                  setFormData({ ...formData, contactNotes: e.target.value })
                }
                rows={2}
                placeholder="Additional contact information or notes"
              />
            </div>

            <div className="space-y-2">
              <Label>Services</Label>
              <div className="grid grid-cols-2 gap-3">
                {services.map((service) => (
                  <div key={service} className="flex items-center space-x-2">
                    <Checkbox
                      id={service}
                      checked={formData.services?.includes(service)}
                      onCheckedChange={(checked) => {
                        const newServices = checked
                          ? [...(formData.services || []), service]
                          : (formData.services || []).filter(
                              (s) => s !== service
                            )
                        setFormData({ ...formData, services: newServices })
                      }}
                    />
                    <label
                      htmlFor={service}
                      className="text-sm capitalize cursor-pointer"
                    >
                      {service.replace('_', ' ')}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            </div>
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
            <Button type="submit" className="w-full sm:w-auto">
              {initialData ? 'Update Flight' : 'Add Flight'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
