/**
 * Fuel order state machine (D22, PLAN "Fuel-to-billing and POS design" section 3). Pure: no database, no UI.
 *
 *   requested --assign--> assigned --start--> fueling --fill--> filled
 *       |                    |                   |
 *       +--------------------+-------------------+--cancel(reason)--> cancelled --reopen--> requested
 *
 * Fill is allowed from any open state. `filled` is terminal: gallons change only through updateFilledOrder.
 * The service layer (services/fuel-orders.service.ts) applies the patches returned here.
 */
export type FuelOrderStatus = 'requested' | 'assigned' | 'fueling' | 'filled' | 'cancelled'

export const FUEL_ORDER_STATUSES: readonly FuelOrderStatus[] = [
  'requested',
  'assigned',
  'fueling',
  'filled',
  'cancelled'
]

export const OPEN_FUEL_ORDER_STATUSES: readonly FuelOrderStatus[] = [
  'requested',
  'assigned',
  'fueling'
]

export type FuelOrderAction = 'assign' | 'start' | 'fill' | 'cancel' | 'reopen'

const TRANSITIONS: Record<FuelOrderAction, { from: readonly FuelOrderStatus[]; to: FuelOrderStatus }> = {
  assign: { from: ['requested'], to: 'assigned' },
  start: { from: ['assigned'], to: 'fueling' },
  fill: { from: OPEN_FUEL_ORDER_STATUSES, to: 'filled' },
  cancel: { from: OPEN_FUEL_ORDER_STATUSES, to: 'cancelled' },
  reopen: { from: ['cancelled'], to: 'requested' }
}

export class FuelOrderTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FuelOrderTransitionError'
  }
}

export function isOpenFuelOrder(status: FuelOrderStatus): boolean {
  return OPEN_FUEL_ORDER_STATUSES.includes(status)
}

export function canTransition(from: FuelOrderStatus, action: FuelOrderAction): boolean {
  return TRANSITIONS[action].from.includes(from)
}

/** The status after `action`, or a FuelOrderTransitionError when the action is not legal from `from`. */
export function nextStatus(from: FuelOrderStatus, action: FuelOrderAction): FuelOrderStatus {
  if (!canTransition(from, action)) {
    throw new FuelOrderTransitionError(`Cannot ${action} a fuel order that is ${from}`)
  }
  return TRANSITIONS[action].to
}

/** The fields a transition writes. A subset of the fuel_transaction columns. */
export interface FuelOrderPatch {
  status?: FuelOrderStatus
  assigned_at?: string | null
  completed_at?: string | null
  filled_by?: number | null
  cancel_reason?: string | null
  gallons_delivered?: number
  fuel_truck_id?: number | null
  prist?: boolean
}

export interface FillInput {
  gallonsDelivered: number
  filledBy?: number | null
  fuelTruckId?: number | null
  prist?: boolean
}

function assertGallons(gallons: number, allowZero: boolean): void {
  const ok = Number.isFinite(gallons) && (allowZero ? gallons >= 0 : gallons > 0)
  if (!ok) {
    throw new FuelOrderTransitionError(
      allowZero ? 'Gallons must be zero or more' : 'Gallons delivered must be more than zero'
    )
  }
}

/** Fields for a new order. `requested` (board, phone) or already `filled` (QT Fuel sheet, walk-up after the fact, scan "No order"). */
export function createPatch(
  kind: 'requested' | 'filled',
  input: { gallonsDelivered?: number; filledBy?: number | null },
  now: Date
): FuelOrderPatch {
  if (kind === 'requested') return { status: 'requested' }
  assertGallons(input.gallonsDelivered ?? Number.NaN, false)
  return {
    status: 'filled',
    gallons_delivered: input.gallonsDelivered,
    completed_at: now.toISOString(),
    filled_by: input.filledBy ?? null
  }
}

export function assignPatch(from: FuelOrderStatus, now: Date): FuelOrderPatch {
  return { status: nextStatus(from, 'assign'), assigned_at: now.toISOString() }
}

export function startPatch(from: FuelOrderStatus): FuelOrderPatch {
  return { status: nextStatus(from, 'start') }
}

export function fillPatch(from: FuelOrderStatus, input: FillInput, now: Date): FuelOrderPatch {
  const status = nextStatus(from, 'fill')
  assertGallons(input.gallonsDelivered, false)
  return {
    status,
    gallons_delivered: input.gallonsDelivered,
    completed_at: now.toISOString(),
    filled_by: input.filledBy ?? null,
    ...(input.fuelTruckId !== undefined ? { fuel_truck_id: input.fuelTruckId } : {}),
    ...(input.prist !== undefined ? { prist: input.prist } : {})
  }
}

export function cancelPatch(from: FuelOrderStatus, reason: string): FuelOrderPatch {
  const status = nextStatus(from, 'cancel')
  const trimmed = reason.trim()
  if (!trimmed) throw new FuelOrderTransitionError('A cancel reason is required')
  return { status, cancel_reason: trimmed }
}

/** Reopening clears the cancel reason and any assignment, so the order is back at the start of the line. */
export function reopenPatch(from: FuelOrderStatus): FuelOrderPatch {
  return { status: nextStatus(from, 'reopen'), cancel_reason: null, assigned_at: null }
}

/**
 * Gallons on a `filled` order change only here. Zero is allowed (the real cancel of a filled order is "edit gallons to 0"
 * with a note, PLAN 7). The status stays `filled`; the change shows in updated_at and raises a difference (D29) later.
 */
export function updateFilledPatch(from: FuelOrderStatus, gallonsDelivered: number): FuelOrderPatch {
  if (from !== 'filled') {
    throw new FuelOrderTransitionError(`Cannot edit gallons on a fuel order that is ${from}`)
  }
  assertGallons(gallonsDelivered, true)
  return { gallons_delivered: gallonsDelivered }
}
