'use client'

import { CalendarWeekView } from '@/components/flight-operations/calendar-week-view'
import { CompactToolbar } from '@/components/flight-operations/compact-toolbar'
import { weekDateParams, weekRange } from '@/components/flight-operations/board-logic'
import { FlightBoard } from '@/components/flight-operations/flight-board'
import { FlightFormDialog } from '@/components/flight-operations/flight-form-dialog'
import { TransactionFormDialog } from '@/components/fuel-dispatch/transaction-form-dialog'
import type {
  Flight,
  FlightFilters
} from '@/components/flight-operations/types'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/components/navigation-wrapper'
import { useFlights } from '@/hooks/use-flights'
import { useTransactions } from '@/hooks/use-transactions'
import { useToast } from '@/hooks/use-toast'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { ErrorMessage } from '@/messages/error-message'
import { useSession } from '@/hooks/use-session'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function FlightOperationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [view, setView] = useState<
    'split' | 'calendar' | 'arrivals' | 'departures'
  >('split')
  const [weekOffset, setWeekOffset] = useState(0)

  // Calendar view loads exactly the visible (local, Sunday-start) week, so navigating weeks always
  // fetches that week's flights. endDate is the last day of the week (inclusive).
  const dateParams =
    view === 'calendar'
      ? weekDateParams(new Date(), weekOffset)
      : undefined // Don't filter by date for split view - show all flights

  const {
    flights,
    loading,
    error,
    createFlight,
    updateFlight,
    deleteFlight,
    forgetFlight
  } = useFlights(dateParams)
  const { createTransaction } = useTransactions()
  const { toast } = useToast()
  const { theme } = useTheme()
  const [filters, setFilters] = useState<FlightFilters>({
    search: '',
    status: 'all',
    dateRange: 'today',
    services: []
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)
  const [fuelFlight, setFuelFlight] = useState<Flight | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  // Load view preference from localStorage on mount
  useEffect(() => {
    const savedView = localStorage.getItem('flightViewPreference')
    if (
      savedView === 'split' ||
      savedView === 'calendar' ||
      savedView === 'arrivals' ||
      savedView === 'departures'
    ) {
      setView(savedView as 'split' | 'calendar' | 'arrivals' | 'departures')
    }
  }, [])

  // Save view preference to localStorage when it changes
  const handleViewChange = (newView: string) => {
    const validView = newView as
      | 'split'
      | 'calendar'
      | 'arrivals'
      | 'departures'
    setView(validView)
    localStorage.setItem('flightViewPreference', validView)
  }

  const handleAddFlight = async (flight: Flight) => {
    try {
      await createFlight(flight)
    } catch (err) {
      console.error('Failed to create flight:', err)
    }
  }

  const handleEditFlight = async (
    flight: Flight,
    expectedModifiedAt?: string
  ) => {
    console.log('handleEditFlight called with:', flight)
    try {
      console.log('Calling updateFlight API with id:', flight.id)
      const result = await updateFlight(flight.id, flight, expectedModifiedAt)
      console.log('Update result:', result)
    } catch (err) {
      // Let the edit-concurrency conflict dialog in FlightFormDialog handle this —
      // don't swallow it here like other, non-concurrency-aware errors below.
      if (err instanceof ConcurrencyConflictError) throw err
      console.error('Failed to update flight:', err)
    }
  }

  // Rethrows so the board can bring the card back and show an error. keepRow leaves the flight in
  // the list until its exit animation finishes (the board then calls forgetFlight).
  const handleDeleteFlight = async (id: string) => {
    try {
      await deleteFlight(id, { keepRow: true })
    } catch (err) {
      console.error('Failed to delete flight:', err)
      throw err
    }
  }

  const handleOrderFuel = (flight: Flight) => {
    setFuelFlight(flight)
    setFuelDialogOpen(true)
  }

  const handleFuelOrderSubmit = async (data: import('@/repositories/transactions.repo').TransactionInsert) => {
    try {
      await createTransaction(data)
      toast({ title: 'Fuel order created' })
      setFuelDialogOpen(false)
      setFuelFlight(null)
    } catch (err) {
      console.error('Failed to create fuel order:', err)
    }
  }

  // Show loading while checking auth
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (status === 'unauthenticated') {
    return null
  }

  if (error) {
    return <ErrorMessage>{error.message}</ErrorMessage>
  }

  // Filter flights for Split View to match the selected week
  const weekInternalFlights = flights.filter((flight) => {
    const flightDate = new Date(
      (flight.departureTime ?? flight.arrivalTime) as string
    )
    const { start: startOfWeek, end: endOfWeek } = weekRange(
      new Date(),
      weekOffset
    )

    return flightDate >= startOfWeek && flightDate < endOfWeek
  })

  return (
    <div className="space-y-4">
      <CompactToolbar
        view={view}
        theme={theme}
        onViewChange={handleViewChange}
        onThemeChange={() => { }}
        filters={filters}
        onFiltersChange={setFilters}
        onAddFlight={() => setIsAddDialogOpen(true)}
      />

      {view === 'split' && (
        <FlightBoard
          mode="split"
          theme={theme}
          flights={flights}
          onAddFlight={handleAddFlight}
          onEditFlight={handleEditFlight}
          onDeleteFlight={handleDeleteFlight}
          onDeleteExited={forgetFlight}
          onOrderFuel={handleOrderFuel}
          loading={loading}
          filters={filters}
        />
      )}
      {view === 'arrivals' && (
        <FlightBoard
          mode="arrivals"
          theme={theme}
          flights={flights}
          onAddFlight={handleAddFlight}
          onEditFlight={handleEditFlight}
          onDeleteFlight={handleDeleteFlight}
          onDeleteExited={forgetFlight}
          onOrderFuel={handleOrderFuel}
          loading={loading}
          filters={filters}
        />
      )}
      {view === 'departures' && (
        <FlightBoard
          mode="departures"
          theme={theme}
          flights={flights}
          onAddFlight={handleAddFlight}
          onEditFlight={handleEditFlight}
          onDeleteFlight={handleDeleteFlight}
          onDeleteExited={forgetFlight}
          onOrderFuel={handleOrderFuel}
          loading={loading}
          filters={filters}
        />
      )}
      {view === 'calendar' && loading && (
        <Skeleton className="h-[32rem] w-full" role="status" aria-label="Loading calendar" />
      )}
      {view === 'calendar' && !loading && (
        <CalendarWeekView
          theme={theme}
          flights={flights}
          onEditFlight={handleEditFlight}
          onDeleteFlight={handleDeleteFlight}
          filters={filters}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
        />
      )}

      <FlightFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddFlight}
        theme={theme}
      />

      <TransactionFormDialog
        open={fuelDialogOpen}
        onOpenChange={(open) => {
          setFuelDialogOpen(open)
          if (!open) setFuelFlight(null)
        }}
        onSubmit={handleFuelOrderSubmit}
        defaultFlightId={fuelFlight ? Number(fuelFlight.id.replace('manual-', '')) : null}
        defaultTailNumber={fuelFlight?.tailNumber}
      />
    </div>
  )
}
