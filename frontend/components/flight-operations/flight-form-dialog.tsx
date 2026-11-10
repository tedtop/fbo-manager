'use client'

import type React from 'react'

import { EditSessionStatus } from '@/components/shared/edit-session-status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { TimeInput } from '@/components/ui/time-input'
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
import { useAircraftTypeLookup } from '@/hooks/use-aircraft-type-lookup'
import { useAirportSettings } from '@/hooks/use-airports'
import { useAppSettings } from '@/hooks/use-app-settings'
import { isBlankTail } from '@/lib/app-settings'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { formatLocalDate } from '@/lib/local-date'
import { useToast } from '@/hooks/use-toast'
import { describeError } from '@/lib/error-message'
import { findIcaoType, formatIcaoType } from '@/lib/icao-aircraft-types'
import { useRecordEditSession } from '@/hooks/use-record-edit-session'
import { FLIGHT_SELECT, type FlightWithRelations } from '@/repositories/flights.repo'
import { rowToFlight } from '@/hooks/use-flights'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AircraftTypeCombobox } from './aircraft-type-combobox'
import { AirportCombobox } from './airport-combobox'
import { prefillAirports } from './airport-prefill'
import { ServicePillPicker } from './service-pill-picker'
import { TailNumberAutocomplete } from './tail-number-autocomplete'
import {
  applyArrivalChange,
  applyDepartureChange,
  applyQuickTurnChange,
  buildTimestamp,
  convertFormZone,
  isQuickTurnSaved,
  toDateInput,
  toTimeInput,
  validateScheduledTimes
} from './flight-time'
import type { Flight } from './types'

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
    expectedUpdatedAt?: string
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
  // The tail field of a new flight starts with the registration prefix from Settings ("N" in the US).
  const { settings } = useAppSettings()
  const tailPrefix = settings.tailNumberPrefix
  const appliedPrefix = useRef(tailPrefix)
  // Every date and time in this form is wall-clock in the display zone (FBO zone, or UTC in Zulu mode).
  const { zone, isZulu, suffixAt, banner } = useDisplayZone()
  const zoneRef = useRef(zone)
  const { homeAirport, homeCountry, displayPreference } = useAirportSettings()
  // Origin/Destination the person has picked or typed: the home-airport prefill never overwrites these.
  const airportTouched = useRef({ origin: false, destination: false })
  const [formData, setFormData] = useState<Partial<Flight>>({
    status: 'scheduled',
    services: [],
    source: 'line-department',
    tailNumber: tailPrefix
  })
  const [date, setDate] = useState(formatLocalDate(new Date(), zone)) // Separate date state (local calendar date)
  const [arrivalTime, setArrivalTime] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  // QT is preselected for new flights (D2): departure follows arrival + 1 h until edited by hand
  const [quickTurn, setQuickTurn] = useState(true)
  const [actualArrivalTime, setActualArrivalTime] = useState('')
  const [actualDepartureTime, setActualDepartureTime] = useState('')
  const { toast } = useToast()
  const [timeError, setTimeError] = useState<string | null>(null)
  const [typeError, setTypeError] = useState<string | null>(null)
  const [tailError, setTailError] = useState<string | null>(null)
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

  // Tail of a just-created aircraft whose type is being looked up in the registry; cleared on a
  // manual pick, a different tail, or once the result has been applied.
  const [lookupTail, setLookupTail] = useState<string | null>(null)
  const typeLookup = useAircraftTypeLookup(lookupTail)
  const lookingUpType = lookupTail !== null && typeLookup.isFetching
  const lookupMissed = lookupTail !== null && !typeLookup.isFetching && !typeLookup.data

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
      setDate(toDateInput(dateSource, zone))
    }
    setScheduled({
      arrival: toTimeInput(flight.arrivalTime, zone),
      departure: toTimeInput(flight.departureTime, zone),
      quickTurn: flight.isQuickTurn ?? false
    })
    setActualArrivalTime(toTimeInput(flight.actualArrivalTime, zone))
    setActualDepartureTime(toTimeInput(flight.actualDepartureTime, zone))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: open is intentionally included so the form resets whenever the Sheet reopens; applyFlightToForm is a stable in-component helper
  useEffect(() => {
    if (initialData) {
      applyFlightToForm(initialData)
    } else {
      appliedPrefix.current = tailPrefix
      setFormData({
        status: 'scheduled',
        services: [],
        source: 'line-department',
        tailNumber: tailPrefix
      })
      setTailError(null)
      airportTouched.current = { origin: false, destination: false }
      setDate(formatLocalDate(new Date(), zone))
      setScheduled({ arrival: '', departure: '', quickTurn: true })
      setActualArrivalTime('')
      setActualDepartureTime('')
    }
  }, [initialData, open])

  // The prefix setting can arrive after the sheet opened (first load) or change in another tab: swap it in,
  // but only while the user has not typed anything beyond the prefix.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the prefix itself changes
  useEffect(() => {
    if (initialData) return
    setFormData((current) =>
      isBlankTail(current.tailNumber, appliedPrefix.current)
        ? { ...current, tailNumber: tailPrefix }
        : current
    )
    appliedPrefix.current = tailPrefix
  }, [tailPrefix])

  // New flights: the home airport goes in whichever end is known from the times (arrival -> Destination,
  // hangar pull -> Origin), recomputed as the times change but only while that field is still untouched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: open re-runs it after the reset effect above
  useEffect(() => {
    if (initialData) return
    const prefill = prefillAirports({
      arrival: arrivalTime,
      departure: departureTime,
      home: homeAirport
    })
    setFormData((current) => {
      const next = { ...current }
      for (const field of ['origin', 'destination'] as const) {
        if (
          !airportTouched.current[field] &&
          (current[field] ?? '') !== prefill[field]
        ) {
          next[field] = prefill[field] || undefined
        }
      }
      return next.origin === current.origin &&
        next.destination === current.destination
        ? current
        : next
    })
  }, [initialData, open, arrivalTime, departureTime, homeAirport])

  // The Zulu toggle (or the FBO zone setting arriving) changed while the sheet is open: keep the same
  // instants and re-read them in the new zone instead of reinterpreting the typed strings.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the zone itself changes
  useEffect(() => {
    const from = zoneRef.current
    if (from === zone) return
    zoneRef.current = zone
    const next = convertFormZone(
      {
        date,
        arrival: arrivalTime,
        departure: departureTime,
        actualArrival: actualArrivalTime,
        actualDeparture: actualDepartureTime
      },
      from,
      zone
    )
    setDate(next.date)
    setArrivalTime(next.arrival)
    setDepartureTime(next.departure)
    setActualArrivalTime(next.actualArrival)
    setActualDepartureTime(next.actualDeparture)
  }, [zone])

  const editSession = useRecordEditSession<FlightWithRelations>({
    table: 'flight',
    recordId: initialData?.id ?? null,
    updatedAt: initialData?.updatedAt ?? null,
    enabled: open && !!initialData,
    select: FLIGHT_SELECT,
    onReload: (freshRow) => {
      // FLIGHT_SELECT embeds flight_service, so services and quantities come from the junction (B26e)
      const reloaded = rowToFlight(freshRow)
      // Keep the shown aircraft type if the joined aircraft carries none.
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
    const picked = aircraftType
      ? aircraft.find(
          (a) => a.tail_number.toLowerCase() === tailNumber.toLowerCase()
        )
      : undefined
    if (aircraftType) setAircraftTypeIcao(picked?.aircraft_type_icao || undefined)
    setTailError(null)
    // An existing aircraft whose type is still Unknown gets the registry lookup retried
    const pickedIcao = picked?.aircraft_type_icao?.toUpperCase()
    const typeUnknown = !!picked && (!pickedIcao || pickedIcao === 'UNKN')
    setLookupTail((current) =>
      typeUnknown
        ? tailNumber.trim()
        : current && current.toUpperCase() === tailNumber.trim().toUpperCase()
          ? current
          : null
    )
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
      setLookupTail(newAircraft.tail_number)
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
    setLookupTail(null)
    setAircraftTypeIcao(icao)
    setIsEditingAircraftType(true)
    setFormData({ ...formData, aircraftType: display })
  }

  // Apply the registry type once the lookup for the current tail returns. Results for a tail
  // the form has moved on from are dropped (lookupTail is cleared when the tail changes).
  useEffect(() => {
    const hit = typeLookup.data
    if (!lookupTail || typeLookup.isFetching || !hit) return
    if (hit.tail !== lookupTail.toUpperCase()) return
    const catalog = findIcaoType(hit.typeIcao)
    const display = catalog
      ? formatIcaoType(catalog)
      : `${hit.manufacturer ?? ''} ${hit.typeDescription}`.trim()
    const icao = catalog?.icao ?? hit.typeIcao
    setLookupTail(null)
    setTypeError(null)
    setAircraftTypeIcao(icao)
    setFormData((current) => ({ ...current, aircraftType: display }))
    updateAircraft(lookupTail, display, icao).catch((error) => {
      console.error('Failed to save looked-up aircraft type:', error)
    })
  }, [lookupTail, typeLookup.data, typeLookup.isFetching, updateAircraft])

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
    const arrivalTimestamp = buildTimestamp(date, arrivalTime, undefined, zone)
    const departureTimestamp = buildTimestamp(
      date,
      departureTime,
      arrivalTime,
      zone
    )
    const actualArrivalTimestamp = buildTimestamp(
      date,
      actualArrivalTime,
      undefined,
      zone
    )
    const actualDepartureTimestamp = buildTimestamp(
      date,
      actualDepartureTime,
      actualArrivalTime || arrivalTime,
      zone
    )
    const savedQuickTurn = isQuickTurnSaved(scheduled)

    // A field holding only the pre-filled prefix has no tail number in it yet.
    if (isBlankTail(formData.tailNumber, tailPrefix)) {
      setTailError('Enter the tail number')
      return
    }
    setTailError(null)

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
      serviceQuantities: formData.serviceQuantities,
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
        const outcome = await editSession.save(async (expectedUpdatedAt) => {
          await onSubmit(flight, expectedUpdatedAt)
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

  // Suffix for the form's date (an edited July flight is MDT even in November; the hint follows it, in the
  // board banner's wording); "Z" in Zulu mode.
  const zoneLabel = suffixAt(
    buildTimestamp(date, arrivalTime || departureTime || '12:00', undefined, zone)
  )

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
                  prefix={initialData ? undefined : tailPrefix}
                  disabled={aircraftLoading}
                />
                {tailError ? (
                  <p
                    id="tailError"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {tailError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Start typing to search existing aircraft or create new
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="aircraftType">Aircraft Type *</Label>
                <AircraftTypeCombobox
                  id="aircraftType"
                  value={formData.aircraftType || ''}
                  icao={aircraftTypeIcao}
                  usageCounts={usageCounts}
                  onSelect={handleAircraftTypeChange}
                  loading={lookingUpType}
                />
                {lookupMissed && (
                  <p className="text-xs text-muted-foreground">
                    No registry match for {lookupTail}; pick a type
                  </p>
                )}
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
              <Label>
                Scheduled Times (24hr) *
                <span
                  data-testid="form-zone-label"
                  className="font-mono text-xs text-muted-foreground"
                >
                  {zoneLabel}
                </span>
              </Label>
              <p
                data-testid="form-zone-hint"
                className="text-xs text-muted-foreground"
              >
                {isZulu ? banner : `Times in ${zoneLabel}`}
              </p>
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
                    <TimeInput
                      id="arrivalTime"
                      value={arrivalTime}
                      onChange={(v) =>
                        setScheduled(applyArrivalChange(scheduled, v))
                      }
                      aria-describedby={timeError ? 'timeError' : undefined}
                    />
                    <Label
                      htmlFor="actualArrivalTime"
                      className="text-xs text-muted-foreground"
                    >
                      Actual{' '}
                      <span data-testid="form-zone-label-actual">
                        {zoneLabel}
                      </span>
                    </Label>
                    <TimeInput
                      id="actualArrivalTime"
                      value={actualArrivalTime}
                      onChange={(v) => setActualArrivalTime(v)}
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
                    <TimeInput
                      id="departureTime"
                      value={departureTime}
                      onChange={(v) =>
                        setScheduled(
                          applyDepartureChange(scheduled, v)
                        )
                      }
                      aria-describedby={timeError ? 'timeError' : undefined}
                    />
                    <Label
                      htmlFor="actualDepartureTime"
                      className="text-xs text-muted-foreground"
                    >
                      Actual{' '}
                      <span data-testid="form-zone-label-actual">
                        {zoneLabel}
                      </span>
                    </Label>
                    <TimeInput
                      id="actualDepartureTime"
                      value={actualDepartureTime}
                      onChange={(v) => setActualDepartureTime(v)}
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
                <AirportCombobox
                  id="origin"
                  value={formData.origin || ''}
                  onChange={(code) => {
                    airportTouched.current.origin = true
                    setFormData({ ...formData, origin: code })
                  }}
                  homeCountry={homeCountry}
                  displayPreference={displayPreference}
                  placeholder="Select origin"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destination</Label>
                <AirportCombobox
                  id="destination"
                  value={formData.destination || ''}
                  onChange={(code) => {
                    airportTouched.current.destination = true
                    setFormData({ ...formData, destination: code })
                  }}
                  homeCountry={homeCountry}
                  displayPreference={displayPreference}
                  placeholder="Select destination"
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
              <ServicePillPicker
                value={formData.services || []}
                onChange={(services) => setFormData({ ...formData, services })}
                quantities={formData.serviceQuantities}
                onQuantitiesChange={(serviceQuantities) =>
                  setFormData((f) => ({ ...f, serviceQuantities }))
                }
              />
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
