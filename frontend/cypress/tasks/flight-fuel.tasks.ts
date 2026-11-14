// Cypress tasks for the board card's Fuel action (B121): seed and read fuel orders of a flight tail, service role,
// local stack only (see ./env.ts). Only fbo-owned rows (orders on spec-owned tails, spec-owned fuelers) are touched.
import { createE2EDbClient } from './db'

interface SeedFuelOrder {
  tail: string
  status: 'requested' | 'assigned' | 'fueling' | 'filled' | 'cancelled'
  gallonsRequested?: number | null
  gallonsDelivered?: number | null
  /** Creates a fueler with this name and assigns it to the order. */
  fuelerName?: string
  cancelReason?: string
}

async function flightIdOf(tail: string): Promise<number> {
  const db = createE2EDbClient()
  const { data, error } = await db.from('flight').select('id').eq('tail_number', tail).order('id', { ascending: false }).limit(1)
  if (error || !data?.length) throw new Error(`flightIdOf ${tail}: ${error?.message ?? 'no flight'}`)
  return data[0].id
}

export const flightFuelTasks = {
  /** Inserts a flight_card fuel order for the latest flight of a tail. Returns the order id. */
  async seedFuelOrder({ tail, status, gallonsRequested = null, gallonsDelivered = null, fuelerName, cancelReason }: SeedFuelOrder) {
    const db = createE2EDbClient()
    const { data, error } = await db
      .from('fuel_transaction')
      .insert({
        flight_id: await flightIdOf(tail),
        tail_number: tail,
        source: 'flight_card',
        status,
        gallons_requested: gallonsRequested,
        gallons_delivered: gallonsDelivered,
        fuel_type: 'jet_a',
        ...(status === 'filled' ? { completed_at: new Date().toISOString() } : {}),
        ...(status === 'cancelled' ? { cancel_reason: cancelReason ?? 'seeded' } : {})
      })
      .select('id')
      .single()
    if (error) throw new Error(`seedFuelOrder: ${error.message}`)
    if (fuelerName) {
      const { error: userError } = await db
        .from('users')
        .upsert(
          { id: 1, username: 'default-flight-creator', password: 'not-a-real-password', first_name: 'Default', last_name: 'Creator', role: 'line' },
          { onConflict: 'id', ignoreDuplicates: true }
        )
      if (userError) throw new Error(`seedFuelOrder: users.id 1: ${userError.message}`)
      const { data: fueler, error: fuelerError } = await db.from('fueler').insert({ user_id: 1, fueler_name: fuelerName }).select('id').single()
      if (fuelerError) throw new Error(`seedFuelOrder: fueler: ${fuelerError.message}`)
      const { error: assignError } = await db.from('fueler_assignment').insert({ transaction_id: data.id, fueler_id: fueler.id })
      if (assignError) throw new Error(`seedFuelOrder: assignment: ${assignError.message}`)
    }
    return data.id
  },

  /** Every fuel order of the latest flight of a tail, oldest first. */
  async getFlightFuelOrders(tail: string) {
    const db = createE2EDbClient()
    const { data, error } = await db
      .from('fuel_transaction')
      .select('*')
      .eq('flight_id', await flightIdOf(tail))
      .order('id')
    if (error) throw new Error(`getFlightFuelOrders: ${error.message}`)
    return data ?? []
  },

  /** Moves an order along the way the line tech would (a UPDATE the card must pick up live or on reload). */
  async setFuelOrderStatus({ id, status, gallonsDelivered }: { id: number; status: SeedFuelOrder['status']; gallonsDelivered?: number }) {
    const db = createE2EDbClient()
    const { error } = await db
      .from('fuel_transaction')
      .update({
        status,
        ...(gallonsDelivered === undefined ? {} : { gallons_delivered: gallonsDelivered }),
        ...(status === 'filled' ? { completed_at: new Date().toISOString() } : {})
      })
      .eq('id', id)
    if (error) throw new Error(`setFuelOrderStatus: ${error.message}`)
    return null
  },

  /** Sets flight.fueled_at (the old "fueled" mark): the card must ignore it and follow the order status only. */
  async setFlightFueledAt({ tail, at }: { tail: string; at: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('flight').update({ fueled_at: at }).eq('id', await flightIdOf(tail))
    if (error) throw new Error(`setFlightFueledAt: ${error.message}`)
    return null
  },

  /** Removes the orders on the given tails and the fuelers named in `fuelerNames` (assignments cascade). */
  async cleanFuelOrders({ tails, fuelerNames = [] }: { tails: string[]; fuelerNames?: string[] }) {
    const db = createE2EDbClient()
    const { error } = await db.from('fuel_transaction').delete().in('tail_number', tails)
    if (error) throw new Error(`cleanFuelOrders: ${error.message}`)
    if (fuelerNames.length) {
      const { error: fuelerError } = await db.from('fueler').delete().in('fueler_name', fuelerNames)
      if (fuelerError) throw new Error(`cleanFuelOrders fueler: ${fuelerError.message}`)
    }
    return null
  }
}
