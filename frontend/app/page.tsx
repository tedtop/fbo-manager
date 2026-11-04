'use client'

import { CalendarWeekView } from '@/components/flight-operations/calendar-week-view'
import { CompactToolbar } from '@/components/flight-operations/compact-toolbar'
import { listFetchWindow, weekDateParams } from '@/components/flight-operations/board-logic'
import { FlightBoard } from '@/components/flight-operations/flight-board'
import { FlightLoadError } from '@/components/flight-operations/flight-load-error'
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
import { describeError } from '@/lib/error-message'
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

  const [filters, setFilters] = useState<FlightFilters>({
    search: '',
    status: 'all',
    dateRange: 'today_future',
    services: [],
    showHidden: false
  })

  // Calendar view loads exactly the visible (local, Sunday-start) week, so navigating weeks always
  // fetches that week's flights. endDate is the last day of the week (inclusive). The list views load a
  // bounded window (listFetchWindow, open-ended for Today + Future); choosing "All Dates" opts in to the
  // unbounded fetch (its own query key). Show hidden is part of the query, so the server returns hidden
  // flights only when asked.
  const dateParams = {
    ...(view === 'calendar'
      ? weekDateParams(new Date(), weekOffset)
      : filters.dateRange === 'all'
        ? undefined
        : listFetchWindow(new Date(), filters.dateRange)),
    includeHidden: filters.showHidden
  }

  const {
    flights,
    loading,
    fetching,
    isPlaceholder,
    error,
    refetch,
    createFlight,
    updateFlight,
    deleteFlight,
    setFlightHidden,
    forgetFlight
  } = useFlights(dateParams)
  const { createTransaction } = useTransactions()
  const { toast } = useToast()
  const { theme } = useTheme()
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

  // Handlers show the toast and rethrow, so the form sheet (and the card) can tell the save failed
  // and stay open with the user's input.
  const handleAddFlight = async (flight: Flight) => {
    try {
      await createFlight(flight)
      toast({ title: 'Flight created' })
    } catch (err) {
      toast({
        title: "Couldn't create flight",
        description: describeError(err),
        variant: 'destructive'
      })
      throw err
    }
  }

  const handleEditFlight = async (
    flight: Flight,
    expectedModifiedAt?: string
  ) => {
    try {
      await updateFlight(flight.id, flight, expectedModifiedAt)
      toast({ title: 'Flight updated' })
    } catch (err) {
      // Let the edit-concurrency conflict dialog in FlightFormDialog handle this (its own UI, no toast).
      if (err instanceof ConcurrencyConflictError) throw err
      toast({
        title: "Couldn't update flight",
        description: describeError(err),
        variant: 'destructive'
      })
      throw err
    }
  }

  // Hide / Unhide from the card. Rethrows like handleEditFlight: a concurrency conflict is reported by the
  // card itself, anything else gets a toast here.
  const handleSetHidden = async (
    flight: Flight,
    hidden: boolean,
    expectedModifiedAt?: string
  ) => {
    try {
      await setFlightHidden(flight.id, hidden, expectedModifiedAt)
      toast({ title: hidden ? 'Flight hidden' : 'Flight unhidden' })
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) throw err
      toast({
        title: hidden ? "Couldn't hide flight" : "Couldn't unhide flight",
        description: describeError(err),
        variant: 'destructive'
      })
      throw err
    }
  }

  // Rethrows so the board can bring the card back. keepRow leaves the flight in
  // the list until its exit animation finishes (the board then calls forgetFlight).
  const handleDeleteFlight = async (id: string) => {
    try {
      await deleteFlight(id, { keepRow: true })
      toast({ title: 'Flight deleted' })
    } catch (err) {
      toast({
        title: "Couldn't delete flight",
        description: describeError(err),
        variant: 'destructive'
      })
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
      toast({
        title: "Couldn't create fuel order",
        description: describeError(err),
        variant: 'destructive'
      })
      throw err
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

  // Failed fetch: with no flights to show, the error replaces the board (toolbar stays, so the view and
  // filters remain usable); with earlier flights on screen it is a banner above them. Both offer Retry.
  const loadFailed = !!error
  const showBoard = !(loadFailed && flights.length === 0)
  // Placeholder data from the previous window must not read as an empty day while the new one loads.
  const boardLoading = loading || (isPlaceholder && flights.length === 0)

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
        fetching={fetching}
      />

      {loadFailed && (
        <FlightLoadError
          message={describeError(error)}
          hasData={flights.length > 0}
          retrying={fetching}
          onRetry={() => void refetch()}
        />
      )}

      {showBoard && view !== 'calendar' && (
        <FlightBoard
          mode={view}
          theme={theme}
          flights={flights}
          onEditFlight={handleEditFlight}
          onDeleteFlight={handleDeleteFlight}
          onHideFlight={(flight, expectedModifiedAt) =>
            handleSetHidden(flight, true, expectedModifiedAt)
          }
          onUnhideFlight={(flight, expectedModifiedAt) =>
            handleSetHidden(flight, false, expectedModifiedAt)
          }
          onDeleteExited={forgetFlight}
          onOrderFuel={handleOrderFuel}
          loading={boardLoading}
          stale={isPlaceholder}
          filters={filters}
          onFiltersChange={setFilters}
        />
      )}
      {showBoard && view === 'calendar' && boardLoading && (
        <Skeleton className="h-[32rem] w-full" role="status" aria-label="Loading calendar" />
      )}
      {showBoard && view === 'calendar' && !boardLoading && (
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
