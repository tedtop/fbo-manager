'use client'

import { CalendarWeekView } from '@/components/flight-operations/calendar-week-view'
import { CompactToolbar } from '@/components/flight-operations/compact-toolbar'
import { FlightBoard } from '@/components/flight-operations/flight-board'
import { FlightFormDialog } from '@/components/flight-operations/flight-form-dialog'
import { TransactionFormDialog } from '@/components/fuel-dispatch/transaction-form-dialog'
import type {
  Flight,
  FlightFilters
} from '@/components/flight-operations/types'
import { useTheme } from '@/components/navigation-wrapper'
import { useFlights } from '@/hooks/use-flights'
import { useTransactions } from '@/hooks/use-transactions'
import { useToast } from '@/hooks/use-toast'
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

  // Calculate date range based on view
  const dateParams =
    view === 'calendar'
      ? (() => {
        const today = new Date()
        const startDate = new Date(today)
        startDate.setDate(today.getDate() - 28) // 4 weeks back
        const endDate = new Date(today)
        endDate.setDate(today.getDate() + 28) // 4 weeks forward
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      })()
      : undefined // Don't filter by date for split view - show all flights

  const { flights, loading, error, createFlight, updateFlight, deleteFlight } =
    useFlights(dateParams)
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
      toast({
        title: 'Failed to create flight',
        description: err instanceof Error ? err.message : 'The flight was not saved.',
        variant: 'destructive'
      })
    }
  }

  const handleEditFlight = async (flight: Flight) => {
    try {
      await updateFlight(flight.id, flight)
    } catch (err) {
      console.error('Failed to update flight:', err)
      toast({
        title: 'Failed to update flight',
        description: err instanceof Error ? err.message : 'The change was not saved.',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteFlight = async (id: string) => {
    try {
      await deleteFlight(id)
    } catch (err) {
      console.error('Failed to delete flight:', err)
      toast({
        title: 'Failed to delete flight',
        description: err instanceof Error ? err.message : 'The flight was not removed.',
        variant: 'destructive'
      })
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
      toast({
        title: 'Failed to create fuel order',
        description: err instanceof Error ? err.message : 'The fuel order was not saved.',
        variant: 'destructive'
      })
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading flights...</div>
      </div>
    )
  }

  if (error) {
    return <ErrorMessage>{error.message}</ErrorMessage>
  }

  // Filter flights for Split View to match the selected week
  const weekInternalFlights = flights.filter((flight) => {
    const flightDate = new Date(flight.departureTime)
    const today = new Date()
    const currentDay = today.getDay() // 0 = Sunday
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - currentDay + weekOffset * 7)
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 7)

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
          onOrderFuel={handleOrderFuel}
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
          onOrderFuel={handleOrderFuel}
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
          onOrderFuel={handleOrderFuel}
          filters={filters}
        />
      )}
      {view === 'calendar' && (
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
