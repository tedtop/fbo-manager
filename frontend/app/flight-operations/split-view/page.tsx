'use client'

import { FlightBoard } from '@/components/flight-operations/flight-board'
import type {
  Flight,
  FlightFilters
} from '@/components/flight-operations/types'
import { useFlights } from '@/hooks/use-flights'
import { useState } from 'react'

export default function SplitViewPage() {
  const {
    flights,
    loading,
    error,
    createFlight,
    updateFlight,
    deleteFlight,
    forgetFlight
  } = useFlights({ today: true })
  const [filters, setFilters] = useState<FlightFilters>({
    search: '',
    status: 'all',
    dateRange: 'today',
    services: []
  })

  const handleEditFlight = async (flight: Flight) => {
    try {
      await updateFlight(flight.id, flight)
    } catch (err) {
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

  const handleAddFlight = async (flight: Flight) => {
    try {
      await createFlight(flight)
    } catch (err) {
      console.error('Failed to create flight:', err)
    }
  }

  if (error) {
    return <div className="text-red-600">Error: {error.message}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Flight Operations - Split View</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Arrivals and Departures side by side
        </p>
      </div>

      <FlightBoard
        mode="split"
        theme="light"
        flights={flights}
        onAddFlight={handleAddFlight}
        onEditFlight={handleEditFlight}
        onDeleteFlight={handleDeleteFlight}
        onDeleteExited={forgetFlight}
        filters={filters}
        loading={loading}
      />
    </div>
  )
}
