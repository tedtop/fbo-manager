'use client'

import type React from 'react'

import { EditSessionStatus } from '@/components/shared/edit-session-status'
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
import { formatLocalDate } from '@/lib/local-date'
import { useToast } from '@/hooks/use-toast'
import { describeError } from '@/lib/error-message'
import { useRecordEditSession } from '@/hooks/use-record-edit-session'
import type { FlightRow } from '@/repositories/flights.repo'
import { useEffect, useMemo, useState } from 'react'
import { AircraftTypeCombobox } from './aircraft-type-combobox'
import { TailNumberAutocomplete } from './tail-number-autocomplete'
import {
  applyArrivalChange,
  applyDepartureChange,
  applyQuickTurnChange,
  buildTimestamp,
  isQuickTurnSaved,
  toDateInput,
  toTimeInput,
  validateScheduledTimes
} from './flight-time'
import { type Flight, apiFlightToComponentFlight } from './types'

// Local "HH:mm" of an ISO timestamp, '' when absent.
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
  onSubmit: (
    flight: Flight,
    expectedModifiedAt?: string
  ) => void | Promise<void>
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
    status: 'scheduled',
    services: [],
    source: 'line-department'
  })
  const [date, setDate] = useState(formatLocalDate(new Date())) // Separate date state (local calendar date)
  const [arrivalTime, setArrivalTime] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  // QT is preselected for new flights (D2): departure follows arrival + 1 h until edited by hand
  const [quickTurn, setQuickTurn] = useState(true)
  const [actualArrivalTime, setActualArrivalTime] = useState('')
  const [actualDepartureTime, setActualDepartureTime] = useState('')
  const { toast } = useToast()
  const [timeError, setTimeError] = useState<string | null>(null)
  const [typeError, setTypeError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setScheduled = (next: {
    arrival: string
    departure: string
    quickTurn: boolean
  }) => {
    setArrivalTime(next.arrival)
    setDepartureTime(next.departure)
    setQuickTurn(next.quickTurn)
    setTimeError(null)
  }
  const scheduled = {
    arrival: arrivalTime,
    departure: departureTime,
    quickTurn
  }
  const [isEditingAircraftType, setIsEditingAircraftType] = useState(false)
  // ICAO code of the selected aircraft type; undefined until known (falls back to the aircraft record)
  const [aircraftTypeIcao, setAircraftTypeIcao] = useState<string | undefined>()

  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of aircraft) {
      const code = a.aircraft_type_icao?.toUpperCase()
      if (code && code !== 'UNKN') counts[code] = (counts[code] ?? 0) + 1
    }
    return counts
  }, [aircraft])

  // Shared by the initialData effect below and the edit-session's "reload their changes"
  // handler, so both populate the form the same way.
  const applyFlightToForm = (flight: Flight) => {
    setFormData(flight)
    setAircraftTypeIcao(
      aircraft.find(
        (a) => a.tail_number.toLowerCase() === flight.tailNumber.toLowerCase()
      )?.aircraft_type_icao || undefined
    )

    // Extract date and times from timestamps (date from the arrival, else the departure)
    const dateSource = flight.arrivalTime ?? flight.departureTime
    if (dateSource) {
      setDate(toDateInput(dateSource))
    }
    setScheduled({
      arrival: toTimeInput(flight.arrivalTime),
      departure: toTimeInput(flight.departureTime),
      quickTurn: flight.isQuickTurn ?? false
    })
    setActualArrivalTime(toTimeInput(flight.actualArrivalTime))
    setActualDepartureTime(toTimeInput(flight.actualDepartureTime))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: open is intentionally included so the form resets whenever the Sheet reopens; applyFlightToForm is a stable in-component helper
  useEffect(() => {
    if (initialData) {
      applyFlightToForm(initialData)
    } else {
      setFormData({
        status: 'scheduled',
        services: [],
        source: 'line-department'
      })
      setDate(formatLocalDate(new Date()))
      setScheduled({ arrival: '', departure: '', quickTurn: true })
      setActualArrivalTime('')
      setActualDepartureTime('')
    }
  }, [initialData, open])

  const editSession = useRecordEditSession<FlightRow>({
    table: 'flight',
    recordId: initialData?.id ?? null,
    modifiedAt: initialData?.updatedAt ?? null,
    enabled: open && !!initialData,
    onReload: (freshRow) => {
      const reloaded = apiFlightToComponentFlight({
        id: freshRow.id,
        aircraft: freshRow.aircraft_id,
        call_sign: freshRow.call_sign,
        scheduled_arrival_time: freshRow.scheduled_arrival_time,
        scheduled_departure_time: freshRow.scheduled_departure_time,
        actual_arrival_time: freshRow.actual_arrival_time,
        actual_departure_time: freshRow.actual_departure_time,
        is_quick_turn: freshRow.is_quick_turn,
        flight_status: freshRow.flight_status,
        origin: freshRow.origin,
        destination: freshRow.destination,
        contact_name: freshRow.contact_name,
        contact_notes: freshRow.contact_notes,
        services: freshRow.services,
        fuel_order_notes: freshRow.fuel_order_notes,
        location_id: freshRow.location_id,
        passenger_count: freshRow.passenger_count,
        notes: freshRow.notes,
        created_by_source: freshRow.created_by_source,
        created_at: freshRow.created_at,
        modified_at: freshRow.modified_at
      })
      // The raw row has no joined aircraft type (only the dedicated FLIGHT_SELECT query
      // does); keep whatever was already shown rather than blanking it out.
      if (!reloaded.aircraftType) {
        reloaded.aircraftType = formData.aircraftType ?? ''
      }
      applyFlightToForm(reloaded)
    }
  })

  const handleTailNumberChange = (
    tailNumber: string,
    aircraftType?: string
  ) => {
    if (aircraftType) {
      setAircraftTypeIcao(
        aircraft.find(
          (a) => a.tail_number.toLowerCase() === tailNumber.toLowerCase()
        )?.aircraft_type_icao || undefined
      )
    }
    setFormData({
      ...formData,
      tailNumber,
      aircraftType: aircraftType || formData.aircraftType
    })
  }

  const handleCreateNewAircraft = async (tailNumber: string) => {
    try {
      const newAircraft = await createAircraft(tailNumber, 'Unknown')
      setAircraftTypeIcao('UNKN')
      setFormData({
        ...formData,
        tailNumber: newAircraft.tail_number,
        aircraftType: (newAircraft as any).aircraft_type_display || 'Unknown'
      })
      setIsEditingAircraftType(true)
    } catch (error) {
      console.error('Failed to create aircraft:', error)
      toast({
        title: "Couldn't create aircraft",
        description: describeError(error),
        variant: 'destructive'
      })
    }
  }

  const handleAircraftTypeChange = (display: string, icao: string) => {
    setTypeError(null)
    setAircraftTypeIcao(icao)
    setIsEditingAircraftType(true)
    setFormData({ ...formData, aircraftType: display })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // At least one scheduled time is required (D6): arrival-only = return, departure-only = hangar pull
    const timeProblem = validateScheduledTimes(arrivalTime, departureTime)
    if (timeProblem) {
      setTimeError(timeProblem)
      return
    }

    // Construct timestamps from date and time values. A time earlier than the one before it in the
    // sequence (arrival -> departure) falls on the next day, e.g. a QT arrival at 23:30 departs at 00:30.
    const arrivalTimestamp = buildTimestamp(date, arrivalTime)
    const departureTimestamp = buildTimestamp(
      date,
      departureTime,
      arrivalTime
    )
    const actualArrivalTimestamp = buildTimestamp(date, actualArrivalTime)
    const actualDepartureTimestamp = buildTimestamp(
      date,
      actualDepartureTime,
      actualArrivalTime || arrivalTime
    )
    const savedQuickTurn = isQuickTurnSaved(scheduled)

    if (!formData.aircraftType) {
      setTypeError('Please select an aircraft type')
      return
    }
    setTypeError(null)

    // Ensure aircraft exists or update it
    if (formData.tailNumber) {
      const existingAircraft = aircraft.find(
        (a) =>
          a.tail_number.toLowerCase() === formData.tailNumber!.toLowerCase()
      )

      try {
        if (!existingAircraft) {
          // Create new aircraft if it doesn't exist
          await createAircraft(
            formData.tailNumber,
            formData.aircraftType || 'Unknown',
            aircraftTypeIcao || 'UNKN'
          )
        } else if (
          formData.aircraftType &&
          (existingAircraft.aircraft_type_display !== formData.aircraftType ||
            (aircraftTypeIcao &&
              existingAircraft.aircraft_type_icao !== aircraftTypeIcao))
        ) {
          // Update existing aircraft if type changed
          await updateAircraft(
            formData.tailNumber,
            formData.aircraftType,
            aircraftTypeIcao ?? existingAircraft.aircraft_type_icao
          )
        }
      } catch (err) {
        console.error('Failed to ensure aircraft exists:', err)
        // We continue anyway; if it failed because it exists, the flight creation might still work.
        // If it failed because of network, flight creation will likely fail too.
      }
    }

    const flight: Flight = {
      id: initialData?.id || `manual-${Date.now()}`,
      tailNumber: formData.tailNumber || '',
      aircraftType: formData.aircraftType || '',
      type: arrivalTimestamp
        ? departureTimestamp
          ? savedQuickTurn
            ? 'quick_turn'
            : 'overnight'
          : 'arrival'
        : 'departure',
      status: formData.status as Flight['status'],
      arrivalTime: arrivalTimestamp,
      departureTime: departureTimestamp,
      actualArrivalTime: actualArrivalTimestamp,
      actualDepartureTime: actualDepartureTimestamp,
      isQuickTurn: savedQuickTurn,
      origin: formData.origin,
      destination: formData.destination,
      contactName: formData.contactName,
      contactNotes: formData.contactNotes,
      services: formData.services || [],
      notes: formData.notes,
      fuelOrderNotes: formData.fuelOrderNotes ?? '',
      locationId: initialData?.locationId,
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

    // The page handler shows the error toast and rethrows; keep the sheet open with the input intact.
    setSaving(true)
    try {
      if (initialData) {
        const outcome = await editSession.save(async (expectedModifiedAt) => {
          await onSubmit(flight, expectedModifiedAt)
        })
        if (outcome.status === 'conflict') return
      } else {
        await onSubmit(flight)
      }
      onOpenChange(false)
    } catch {
      // Already surfaced by the caller's toast.
    } finally {
      setSaving(false)
    }
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

        {initialData && (
          <div className="px-4 pt-4">
            <EditSessionStatus
              editSession={editSession}
              onOverwriteComplete={() => onOpenChange(false)}
            />
          </div>
        )}

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
                <AircraftTypeCombobox
                  id="aircraftType"
                  value={formData.aircraftType || ''}
                  icao={aircraftTypeIcao}
                  usageCounts={usageCounts}
                  onSelect={handleAircraftTypeChange}
                />
                {typeError && (
                  <p
                    id="typeError"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {typeError}
                  </p>
                )}
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
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value as any })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
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
              <Label>Scheduled Times (24hr) *</Label>
              <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3">
                  <div className="space-y-2">
                    <Label
                      htmlFor="arrivalTime"
                      className="text-sm text-muted-foreground flex items-center gap-2"
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-success"></span>
                      Arrival
                    </Label>
                    <Input
                      id="arrivalTime"
                      type="time"
                      value={arrivalTime}
                      onChange={(e) =>
                        setScheduled(applyArrivalChange(scheduled, e.target.value))
                      }
                      aria-describedby={timeError ? 'timeError' : undefined}
                    />
                    <Label
                      htmlFor="actualArrivalTime"
                      className="text-xs text-muted-foreground"
                    >
                      Actual
                    </Label>
                    <Input
                      id="actualArrivalTime"
                      type="time"
                      value={actualArrivalTime}
                      onChange={(e) => setActualArrivalTime(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col items-center gap-2 pt-7">
                    <Checkbox
                      id="quickTurn"
                      checked={quickTurn}
                      onCheckedChange={(checked) =>
                        setScheduled(
                          applyQuickTurnChange(scheduled, checked === true)
                        )
                      }
                    />
                    <label
                      htmlFor="quickTurn"
                      className="text-xs font-semibold cursor-pointer"
                      title="Quick turn: departure is 1 hour after arrival"
                    >
                      QT
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="departureTime"
                      className="text-sm text-muted-foreground flex items-center gap-2"
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-accent"></span>
                      Departure
                    </Label>
                    <Input
                      id="departureTime"
                      type="time"
                      value={departureTime}
                      onChange={(e) =>
                        setScheduled(
                          applyDepartureChange(scheduled, e.target.value)
                        )
                      }
                      aria-describedby={timeError ? 'timeError' : undefined}
                    />
                    <Label
                      htmlFor="actualDepartureTime"
                      className="text-xs text-muted-foreground"
                    >
                      Actual
                    </Label>
                    <Input
                      id="actualDepartureTime"
                      type="time"
                      value={actualDepartureTime}
                      onChange={(e) => setActualDepartureTime(e.target.value)}
                    />
                  </div>
                </div>

                {timeError && (
                  <p
                    id="timeError"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {timeError}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Leave departure blank for a return, or arrival blank for a
                  hangar pull.
                </p>

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

            <div className="space-y-2">
              <Label htmlFor="fuelOrderNotes">Fuel order notes</Label>
              <Textarea
                id="fuelOrderNotes"
                value={formData.fuelOrderNotes || ''}
                onChange={(e) =>
                  setFormData({ ...formData, fuelOrderNotes: e.target.value })
                }
                rows={2}
                placeholder="Fuel type, quantity, special instructions"
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
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Saving...' : initialData ? 'Update Flight' : 'Add Flight'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
