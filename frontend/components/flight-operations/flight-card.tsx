'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { TailNumberLink } from '@/components/aircraft/tail-number-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import type { AirportLabel } from '@/hooks/use-airports'
import { cn } from '@/lib/utils'
import { flightKind, isFlightHidden, type LinkColor } from './board-logic'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { formatBoardTimestamp } from '@/lib/display-zone'
import { useFlightFuelStatus } from '@/hooks/use-flight-fuel-status'
import { useSyncedDraft } from '@/hooks/use-synced-draft'
import { useToast } from '@/hooks/use-toast'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  Clock,
  Eye,
  EyeOff,
  Fuel as FuelIcon,
  MapPin,
  Pencil,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Trash2,
  User,
  Users,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ServicePill, ServicePillPicker } from './service-pill-picker'
import { FlightCardSkeletonBody } from './flight-card-skeleton'
import { FlightFormDialog } from './flight-form-dialog'
import { WingLoadingPanel } from '@/components/fuel-dispatch/wing-loading-panel'
import { QT_FLIGHT_PREFIX } from '@/lib/qt-flights'
import type { Flight } from './types'

// Calculate time remaining until a timestamp
function getTimeRemaining(timestamp: string): {
  text: string
  isUrgent: boolean
} {
  const now = new Date()
  const target = new Date(timestamp)
  const diffMs = target.getTime() - now.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 0) {
    return { text: '', isUrgent: false } // Past events don't show countdown
  }

  if (diffMinutes < 60) {
    return { text: `in ${diffMinutes}m`, isUrgent: true }
  }

  const diffHours = Math.floor(diffMinutes / 60)
  const remainingMinutes = diffMinutes % 60

  if (diffHours < 24) {
    return { text: `in ${diffHours}h ${remainingMinutes}m`, isUrgent: false }
  }

  const diffDays = Math.floor(diffHours / 24)
  return { text: `in ${diffDays}d`, isUrgent: false }
}

interface FlightCardProps {
  flight: Flight
  theme: 'dark' | 'light'
  onEdit: (flight: Flight, expectedUpdatedAt?: string) => void | Promise<void>
  onDelete: (id: string) => void
  // Hide / Unhide button (B43b); same compare-and-swap guard as a status change. Omit to hide the button.
  onHide?: (flight: Flight, expectedUpdatedAt?: string) => void | Promise<void>
  onUnhide?: (flight: Flight, expectedUpdatedAt?: string) => void | Promise<void>
  onOrderFuel?: (flight: Flight) => void
  isLinked?: boolean
  linkColor?: LinkColor
  isHovered?: boolean
  onHover?: (id: string | null) => void
  // Board column the card is rendered in; decides whether it shows the arrival or the departure time.
  column?: 'arrival' | 'departure'
  // Preferred display code (+ ICAO tooltip) for a stored airport code; the list resolves them in one query.
  // Without it the stored text is shown as is.
  airportLabel?: (code: string | null | undefined) => AirportLabel | null
  // 'deleting': content has faded into a skeleton while the delete is saved.
  // 'zapping': saved; the card is playing its exit animation.
  deleteState?: 'deleting' | 'zapping'
}

const statusConfig = {
  scheduled: {
    label: 'Scheduled',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
  },
  arrived: {
    label: 'Arrived',
    color: 'bg-green-500/10 text-green-500 border-green-500/20'
  },
  departed: {
    label: 'Departed',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
  },
  delayed: {
    label: 'Delayed',
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20'
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-red-500/10 text-red-500 border-red-500/20'
  }
}

export function FlightCard({
  flight,
  theme,
  onEdit,
  onDelete,
  onHide,
  onUnhide,
  onOrderFuel,
  isLinked,
  linkColor,
  isHovered,
  onHover,
  column,
  airportLabel,
  deleteState
}: FlightCardProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isEditingServices, setIsEditingServices] = useState(false)
  const { toast } = useToast()
  const { zone, suffixAt } = useDisplayZone()
  // Local edits (inline services and passenger count) are optimistic drafts over the props: a draft
  // is dropped as soon as the flight's own value changes (saved from the edit sheet, another user,
  // a refetch), so the card never keeps showing stale data.
  const [passengerCount, setPassengerCount] = useSyncedDraft(
    flight.passengers?.toString() || ''
  )
  const [localServices, setLocalServices, resetLocalServices] =
    useSyncedDraft<string[]>(flight.services)
  const [localQuantities, setLocalQuantities, resetLocalQuantities] =
    useSyncedDraft<Record<string, number>>(flight.serviceQuantities ?? {})
  const notes = flight.notes || ''
  const kind = flightKind(flight)
  const [countdown, setCountdown] = useState<{
    text: string
    isUrgent: boolean
  }>({ text: '', isUrgent: false })

  // Airline dispatches from QT are merged into the board live and read-only (change them in QT).
  const isQt = flight.source === 'qt'
  const isDbFlight = !flight.id.startsWith('manual-') && !isQt
  const fuelStatus = useFlightFuelStatus(isDbFlight ? Number(flight.id) : 0)

  const status = statusConfig[flight.status]
  // Only on the board while "Show hidden" is on: the card is muted, marked Hidden and offers Unhide.
  const isHidden = isFlightHidden(flight, new Date())
  const isArrival = column
    ? column === 'arrival'
    : flight.type === 'arrival' ||
      flight.type === 'quick_turn' ||
      flight.type === 'overnight' ||
      flight.type === 'long_term'
  const isDeparture =
    flight.type === 'departure' ||
    flight.type === 'quick_turn' ||
    flight.type === 'overnight' ||
    flight.type === 'long_term'
  const PlaneIcon = isQt ? Plane : isArrival ? PlaneLanding : PlaneTakeoff


  // Update countdown every minute
  useEffect(() => {
    const updateCountdown = () => {
      const primaryTimestamp = isArrival
        ? flight.arrivalTime
        : flight.departureTime
      if (primaryTimestamp) {
        setCountdown(getTimeRemaining(primaryTimestamp))
      }
    }

    updateCountdown() // Initial update
    const interval = setInterval(updateCountdown, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [flight.arrivalTime, flight.departureTime, isArrival])

  // Status changes use the same compare-and-swap guard as the edit sheet: a card that is out of
  // date (someone else saved the flight since it was loaded) is refused instead of overwriting.
  const changeStatus = (nextStatus: Flight['status']) => {
    void Promise.resolve(
      onEdit({ ...flight, status: nextStatus }, flight.updatedAt)
    ).catch((err) => {
      // Other failures are toasted by the page handler; it stays silent for conflicts because the
      // edit sheet has its own conflict dialog, and the card has none.
      if (err instanceof ConcurrencyConflictError) {
        toast({
          title: 'Flight was changed by someone else',
          description:
            'The status was not changed. Check the latest details and try again.',
          variant: 'destructive'
        })
      }
    })
  }

  const toggleHidden = () => {
    const handler = isHidden ? onUnhide : onHide
    void Promise.resolve(handler?.(flight, flight.updatedAt)).catch((err) => {
      // Other failures are toasted by the page handler; a conflict is reported here, as for status changes.
      if (err instanceof ConcurrencyConflictError) {
        toast({
          title: 'Flight was changed by someone else',
          description: `The flight was not ${isHidden ? 'unhidden' : 'hidden'}. Check the latest details and try again.`,
          variant: 'destructive'
        })
      }
    })
  }

  // Fuel Request: one tap adds the fuel service through the same onEdit save as the inline service
  // pills, with the compare-and-swap guard of status changes. Optimistic: the Fuel pill shows at once
  // and is reverted if the save fails (the page handler toasts non-conflict failures).
  const hasFuel = localServices.includes('fuel')
  const canRequestFuel = !isQt && ['scheduled', 'delayed', 'arrived'].includes(flight.status)
  const [fuelPending, setFuelPending] = useState(false)
  const requestFuel = () => {
    if (hasFuel || fuelPending) return
    setFuelPending(true)
    setLocalServices([...localServices, 'fuel'])
    void Promise.resolve(
      onEdit(
        { ...flight, services: [...localServices, 'fuel'], serviceQuantities: localQuantities },
        flight.updatedAt
      )
    )
      .then(() => toast({ title: `Fuel requested for ${flight.tailNumber}` }))
      .catch((err) => {
        resetLocalServices()
        if (err instanceof ConcurrencyConflictError) {
          toast({
            title: 'Flight was changed by someone else',
            description:
              'Fuel was not requested. Check the latest details and try again.',
            variant: 'destructive'
          })
        }
      })
      .finally(() => setFuelPending(false))
  }

  const saveChanges = () => {
    // Failures are toasted by the page handler; swallow the rethrow so it isn't unhandled.
    void Promise.resolve(
      onEdit({
        ...flight,
        services: localServices,
        serviceQuantities: localQuantities,
        notes,
        passengers: passengerCount ? Number.parseInt(passengerCount) : undefined
      })
    ).catch(() => {})
    setIsEditingServices(false)
  }

  // "MM/DD HH:mm" in the display zone (FBO zone, or Zulu); the zone suffix is rendered next to it.
  const formatTimestamp = (timestamp?: string) => formatBoardTimestamp(timestamp, zone)
  const zoneTag = (timestamp?: string) =>
    timestamp ? (
      <span data-testid="flight-time-zone" className="text-[10px] font-semibold text-muted-foreground">
        {suffixAt(timestamp)}
      </span>
    ) : null

  return (
    <>
      <Card
        data-testid="flight-card"
        className={cn(
          'bg-card border-border hover:border-primary/20 transition-all relative',
          isLinked && linkColor && `border-l-4 ${linkColor.border}`,
          // Hover ring: a linked flight uses its link color on both cards so the pair reads as one.
          isHovered &&
            `ring-2 ring-offset-2 ring-offset-background ${
              isLinked && linkColor ? linkColor.ring : 'ring-primary/50'
            }`,
          deleteState && 'pointer-events-none',
          deleteState === 'zapping' && 'animate-flight-zap',
          isHidden && 'opacity-60'
        )}
        data-hidden={isHidden || undefined}
        aria-busy={deleteState ? true : undefined}
        onMouseEnter={() => onHover?.(flight.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <div
          className={cn(
            'p-1.5 space-y-1.5 transition-opacity duration-300',
            deleteState && 'opacity-0'
          )}
        >
          {/* Header with tail number, aircraft type, and status */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              {/* Airlines get the big plane; GA gets the landing / takeoff glyphs. */}
              <PlaneIcon
                data-testid={isQt ? 'airline-icon' : undefined}
                className={cn(
                  'w-4 h-4',
                  isArrival ? 'text-green-500' : 'text-blue-500'
                )}
              />
              {isQt && flight.callSign ? (
                // Airlines are known by flight number, with the tail alongside: UA1026 (N345NN)
                <>
                  <span data-testid="qt-callsign" className="text-lg font-bold font-mono text-foreground">
                    {flight.callSign}
                  </span>
                  {flight.tailNumber && (
                    <span className="font-mono text-sm text-muted-foreground">
                      (
                      <TailNumberLink
                        tail={flight.tailNumber}
                        className="hover:text-primary hover:underline underline-offset-2"
                      />
                      )
                    </span>
                  )}
                </>
              ) : (
                flight.tailNumber && (
                  <TailNumberLink
                    tail={flight.tailNumber}
                    className="text-lg font-bold font-mono text-foreground hover:text-primary hover:underline underline-offset-2"
                  />
                )
              )}
              {isLinked && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn('p-0.5 rounded', linkColor?.tint)}
                      >
                        <ArrowLeftRight
                          className={cn('w-3 h-3', linkColor?.text)}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        Linked flight (arrival & departure)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <span className="text-sm text-muted-foreground">
                {flight.aircraftType}
              </span>
              {flight.parkingArea && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        data-testid="flight-parking-area"
                        className="min-w-0 max-w-32 gap-1 px-1.5 py-0 text-xs font-normal"
                      >
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{flight.parkingArea.name}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {flight.parkingArea.kind.replace('_', ' ')} ·{' '}
                        {flight.parkingArea.code}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {kind !== 'transient' && (
                <Badge
                  variant="outline"
                  data-testid="flight-card-pull-badge"
                  className="text-[10px] font-semibold px-1.5 py-0"
                >
                  {kind === 'hangar_pull' ? 'Hangar pull' : 'Return'}
                </Badge>
              )}
              {flight.isQuickTurn && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold px-1.5 py-0"
                  title="Quick turn"
                >
                  QT
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isHidden && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold px-1.5 py-0 text-muted-foreground"
                >
                  Hidden
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Badge
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 cursor-pointer hover:opacity-80 transition-opacity',
                      status.color
                    )}
                  >
                    {status.label}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(
                    Object.keys(statusConfig) as Array<
                      keyof typeof statusConfig
                    >
                  ).map((statusKey) => (
                    <DropdownMenuItem
                      key={statusKey}
                      onClick={() => changeStatus(statusKey)}
                      className="text-xs"
                    >
                      <span
                        className={cn(
                          'inline-block w-2 h-2 rounded-full mr-2',
                          statusConfig[statusKey].color
                        )}
                      />
                      {statusConfig[statusKey].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Service notes (B24): prominent, right under the header, e.g. "T/O fuel, TKS fluid" */}
          {notes && (
            <div
              data-testid="flight-card-notes"
              className="flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/15 p-2 text-sm font-medium"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 whitespace-pre-wrap break-words text-foreground">{notes}</span>
            </div>
          )}

          {/* Origin/Destination */}
          {isArrival && flight.origin && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">From</span>
              <span
                className="font-semibold text-foreground"
                title={airportLabel?.(flight.origin)?.title}
                data-testid="flight-origin"
              >
                {airportLabel?.(flight.origin)?.text ?? flight.origin}
              </span>
            </div>
          )}
          {isDeparture && flight.destination && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">To</span>
              <span
                className="font-semibold text-foreground"
                title={airportLabel?.(flight.destination)?.title}
                data-testid="flight-destination"
              >
                {airportLabel?.(flight.destination)?.text ?? flight.destination}
              </span>
            </div>
          )}

          {/* Contact Name (optional) */}
          {flight.contactName && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Contact:</span>
              <span className="text-foreground">{flight.contactName}</span>
            </div>
          )}

          {/* Contact Notes (optional) */}
          {flight.contactNotes && (
            <div className="flex items-start gap-1.5 text-xs p-1.5 rounded border bg-blue-500/10 border-blue-500/20">
              <User className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
              <span className="min-w-0 break-words text-foreground">{flight.contactNotes}</span>
            </div>
          )}

          {/* Fuel Section */}
          {localServices.includes('fuel') && (
            <div className="space-y-1.5 pt-1.5 border-t border-border">
              <div className="flex items-center gap-2">
                <FuelIcon className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-foreground">
                  Fuel
                </span>
              </div>
              {fuelStatus.isFueled ? (
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <Check className="w-3 h-3" />
                  Fueled
                  {fuelStatus.fueledAt && (
                    <span className="text-muted-foreground">
                      at {new Date(fuelStatus.fueledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: zone })}
                    </span>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOrderFuel?.(flight)}
                  className="h-7 text-xs"
                >
                  <FuelIcon className="w-3 h-3 mr-1" />
                  Fuel Request
                </Button>
              )}
            </div>
          )}

          {/* Passenger Count Section */}
          {localServices.includes('passengers') && (
            <div className="space-y-1.5 pt-1.5 border-t border-border">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-foreground">
                  Passengers
                </span>
              </div>
              <Input
                type="number"
                placeholder="Count"
                value={passengerCount}
                onChange={(e) => setPassengerCount(e.target.value)}
                onBlur={saveChanges}
                className="text-xs h-7 w-20"
                min="0"
              />
            </div>
          )}

          {/* Services */}
          {isEditingServices ? (
            <div className="space-y-1.5 pt-1.5 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Services
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={saveChanges}
                    className="h-6 text-xs px-2"
                  >
                    <Check className="w-3 h-3 mr-0.5" /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      resetLocalServices()
                      resetLocalQuantities()
                      setIsEditingServices(false)
                    }}
                    className="h-6 text-xs px-2"
                  >
                    <X className="w-3 h-3 mr-0.5" /> Cancel
                  </Button>
                </div>
              </div>
              <ServicePillPicker
                value={localServices}
                onChange={setLocalServices}
                quantities={localQuantities}
                onQuantitiesChange={setLocalQuantities}
              />
            </div>
          ) : (
            <>
              {localServices.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border">
                  {localServices.map((serviceKey) => (
                    <ServicePill
                      key={serviceKey}
                      serviceKey={serviceKey}
                      quantity={localQuantities[serviceKey]}
                    />
                  ))}
                  {!isQt && (
                    <button
                      onClick={() => setIsEditingServices(true)}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border border-dashed border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  )}
                </div>
              )}
              {localServices.length === 0 && !isQt && (
                <button
                  onClick={() => setIsEditingServices(true)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border border-dashed border-primary/40 text-primary hover:bg-primary/10 transition-colors mt-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Services
                </button>
              )}
            </>
          )}

          {/* Time Display with Countdown - Above divider, left of badges */}
          <div className="flex items-center justify-between pt-1.5 border-t border-border">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {isArrival ? 'ETA:' : 'ETD:'}
              </span>
              <span className="font-bold font-mono text-foreground">
                {formatTimestamp(
                  isArrival ? flight.arrivalTime : flight.departureTime
                )}
              </span>
              {zoneTag(isArrival ? flight.arrivalTime : flight.departureTime)}
              {(isArrival
                ? flight.actualArrivalTime
                : flight.actualDepartureTime) && (
                <span className="text-xs text-muted-foreground">
                  {isArrival ? 'Actual arr:' : 'Actual dep:'}{' '}
                  <span className="font-mono text-foreground">
                    {formatTimestamp(
                      isArrival
                        ? flight.actualArrivalTime
                        : flight.actualDepartureTime
                    )}
                  </span>{' '}
                  {zoneTag(
                    isArrival
                      ? flight.actualArrivalTime
                      : flight.actualDepartureTime
                  )}
                </span>
              )}
              {countdown.text && (
                <span
                  className={cn(
                    'text-xs font-medium',
                    countdown.isUrgent
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                  )}
                >
                  {countdown.text}
                </span>
              )}
            </div>

            {/* Creator and Source Badges - Right side */}
            <div className="flex shrink-0 items-center gap-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold px-1.5 py-0 cursor-help bg-muted/50 hover:bg-muted"
                    >
                      {flight.createdBy.initials}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="font-semibold">
                        {flight.createdBy.name}
                      </div>
                      <div className="text-muted-foreground">
                        {flight.createdBy.department}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge
                variant="secondary"
                className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0"
              >
                {flight.source === 'qt'
                  ? 'QT'
                  : flight.source === 'front-desk'
                    ? 'FD'
                    : flight.source === 'line-department'
                      ? 'LD'
                      : 'GC'}
              </Badge>
            </div>
          </div>

          {isQt && flight.fuelLbs ? (
            <WingLoadingPanel aircraftType={flight.aircraftType} plannedLbs={flight.fuelLbs} title={`${flight.callSign ?? ""} ${flight.tailNumber}`.trim()} qtDispatchId={flight.id.startsWith(QT_FLIGHT_PREFIX) ? flight.id.slice(QT_FLIGHT_PREFIX.length) : undefined} tailNumber={flight.tailNumber} airline={flight.contactName} />
          ) : null}

          {/* Actions: Edit, Hide and Fuel Request share the width equally; Delete stays compact at the end. */}
          {isQt ? (
            <p
              data-testid="qt-readonly"
              className="pt-1.5 border-t border-border text-[11px] text-muted-foreground"
            >
              Airline flight from QT: read-only here, change it in QT.
            </p>
          ) : (
          <div className="flex gap-1 pt-1.5 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              data-testid="card-edit"
              onClick={() => setIsEditDialogOpen(true)}
              className="h-7 min-w-0 flex-1 basis-0 px-1 text-xs"
            >
              <Pencil className="w-3 h-3 mr-1 shrink-0" />
              Edit
            </Button>
            {(isHidden ? onUnhide : onHide) && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="card-hide"
                onClick={toggleHidden}
                className="h-7 min-w-0 flex-1 basis-0 px-1 text-xs"
              >
                {isHidden ? (
                  <Eye className="w-3 h-3 mr-1 shrink-0" />
                ) : (
                  <EyeOff className="w-3 h-3 mr-1 shrink-0" />
                )}
                {isHidden ? 'Unhide' : 'Hide'}
              </Button>
            )}
            {canRequestFuel && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="card-fuel-request"
                disabled={hasFuel || fuelPending}
                aria-label={hasFuel ? 'Fuel requested' : 'Fuel Request'}
                onClick={requestFuel}
                className="h-7 min-w-0 flex-1 basis-0 px-1 text-xs disabled:opacity-100"
              >
                {hasFuel ? (
                  <Check className="w-3 h-3 mr-1 shrink-0 text-green-600" />
                ) : (
                  <FuelIcon className="w-3 h-3 mr-1 shrink-0" />
                )}
                <span className="sm:hidden">Fuel</span>
                <span className="hidden sm:inline">
                  {hasFuel ? 'Fuel requested' : 'Fuel Request'}
                </span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              data-testid="card-delete"
              aria-label="Delete"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="h-7 w-8 shrink-0 px-0 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3 h-3" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
          )}
        </div>
        {deleteState && (
          <FlightCardSkeletonBody className="absolute inset-0 animate-in fade-in duration-300" />
        )}
      </Card>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {flight.tailNumber || 'this flight'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {flight.tailNumber || 'This flight'} will be removed from the
              board. The record is kept in the database, so an admin can
              restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(flight.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FlightFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSubmit={onEdit}
        initialData={flight}
        theme={theme}
      />
    </>
  )
}
