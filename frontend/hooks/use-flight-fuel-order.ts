'use client'

import { createClient } from '@/lib/supabase/client'
import { fuelChip, pickCardOrder, type FlightFuelOrder, type FuelChip } from '@/lib/flight-fuel-order'
import { findFlightFuelOrders } from '@/repositories/transactions.repo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

export const flightFuelOrderKey = (flightId: number) => ['flight-fuel-orders', flightId] as const

let channelCounter = 0

/**
 * The fuel order that speaks for a board card (open one first, then filled, then cancelled) and its chip. Reads
 * fuel_transaction only: flight.fueled_at is ignored (D25). Refetches on any change to the flight's orders.
 * Pass 0 (or NaN) for flights that have no database id; nothing is fetched then.
 */
export function useFlightFuelOrder(flightId: number): {
  order: FlightFuelOrder | null
  chip: FuelChip | null
  loading: boolean
} {
  const db = useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const enabled = Number.isFinite(flightId) && flightId > 0
  const query = useQuery({
    queryKey: flightFuelOrderKey(flightId),
    queryFn: () => findFlightFuelOrders(db, flightId),
    enabled
  })

  useEffect(() => {
    if (!enabled) return
    const channel = db.channel(`flight-fuel-order-${flightId}-${++channelCounter}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'fuel_transaction', filter: `flight_id=eq.${flightId}` },
      () => void qc.invalidateQueries({ queryKey: flightFuelOrderKey(flightId) })
    )
    channel.subscribe()
    return () => {
      void db.removeChannel(channel)
    }
  }, [db, qc, flightId, enabled])

  const order = useMemo(() => pickCardOrder(query.data ?? []), [query.data])
  return { order, chip: fuelChip(order), loading: enabled && query.isLoading }
}
