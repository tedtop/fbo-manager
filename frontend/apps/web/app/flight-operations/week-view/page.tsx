'use client'

import { CalendarWeekView } from '@/components/flight-operations/calendar-week-view'
import type {
  Flight,
  FlightFilters
} from '@/components/flight-operations/types'
import { useFlights } from '@/hooks/use-flights'
import { useState } from 'react'

export default function WeekViewPage() {
  const [weekOffset, setWeekOffset] = useState(0)

  // Calculate date range for the visible week
  // CalendarWeekView logic: starts from today + offset * 7
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() + weekOffset * 7)

  // End date is start + 7 days
  const end = new Date(start)
  end.setDate(start.getDate() + 7)

  const startDate = start.toISOString().split('T')[0]
  const endDate = end.toISOString().split('T')[0]

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

  const handleEditFlight = async (flight: Flight) => {
    console.log('handleEditFlight called with:', flight)
    try {
      console.log('Calling updateFlight API with id:', flight.id)
      const result = await updateFlight(flight.id, flight)
      console.log('Update result:', result)
    } catch (err) {
      console.error('Failed to update flight:', err)
    }
  }

  const handleDeleteFlight = async (id: string) => {
    try {
      await deleteFlight(id)
    } catch (err) {
      console.error('Failed to delete flight:', err)
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
