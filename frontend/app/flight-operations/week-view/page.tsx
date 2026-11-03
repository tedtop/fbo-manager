'use client'

import { weekDateParams } from '@/components/flight-operations/board-logic'
import { CalendarWeekView } from '@/components/flight-operations/calendar-week-view'
import type {
  Flight,
  FlightFilters
} from '@/components/flight-operations/types'
import { useFlights } from '@/hooks/use-flights'
import { useToast } from '@/hooks/use-toast'
import { describeError } from '@/lib/error-message'
import { useState } from 'react'

export default function WeekViewPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const { toast } = useToast()

  // Same local Sunday-start week the calendar renders (CalendarWeekView uses weekRange too)
  const { startDate, endDate } = weekDateParams(new Date(), weekOffset)

  const { flights, loading, error, updateFlight, deleteFlight } = useFlights({
    startDate,
    endDate
  })

  const [filters, setFilters] = useState<FlightFilters>({
    search: '',
    status: 'all',
    dateRange: 'today',
    services: []
  })

  const fail = (title: string, err: unknown): never => {
    toast({ title, description: describeError(err), variant: 'destructive' })
    throw err
  }

  const handleEditFlight = async (flight: Flight) => {
    try {
      await updateFlight(flight.id, flight)
      toast({ title: 'Flight updated' })
    } catch (err) {
      fail("Couldn't update flight", err)
    }
  }

  const handleDeleteFlight = async (id: string) => {
    try {
      await deleteFlight(id)
      toast({ title: 'Flight deleted' })
    } catch (err) {
      fail("Couldn't delete flight", err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">Loading...</div>
    )
  }

  if (error) {
    return <div className="text-red-600">Error: {error.message}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Flight Operations - Week View</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Calendar view of all flights across the week
        </p>
      </div>

      <CalendarWeekView
        theme="light"
        flights={flights}
        onEditFlight={handleEditFlight}
        onDeleteFlight={handleDeleteFlight}
        filters={filters}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
      />
    </div>
  )
}
