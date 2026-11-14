/**
 * The board card's fuel order (D25), pure: the Fuel sheet's form <-> fuel_transaction fields, and the chip the card
 * shows. The chip comes from the order status only (`flight.fueled_at` is ignored). No database, no UI.
 */
import { isOpenFuelOrder, FuelOrderTransitionError, type FuelOrderStatus } from '@/lib/fuel-orders'
import {
  fromTransactionFuelType,
  toTransactionFuelType,
  type FuelType,
  type TransactionFuelType
} from '@/lib/fuel-types'
import { formatLocalDate, formatLocalTime, zonedTimeToInstant } from '@/lib/local-date'

/** Fuel types the sheet offers; Jet A+ is Jet A with the Prist switch on (lib/fuel-types.ts). */
export type CardFuelType = Extract<FuelType, 'jet_a' | 'avgas_100'>

export interface FuelSheetForm {
  topOff: boolean
  /** Whole or decimal gallons as typed; ignored when `topOff`. */
  gallons: string
  fuelType: CardFuelType
  prist: boolean
  /** "HH:mm" in the display zone, "" when no time is wanted. */
  time: string
  note: string
}

export const EMPTY_FUEL_FORM: FuelSheetForm = {
  topOff: true,
  gallons: '',
  fuelType: 'jet_a',
  prist: false,
  time: '',
  note: ''
}

/** The order columns the sheet writes, for both create and edit. */
export interface FuelRequestFields {
  gallons_requested: number | null
  fuel_type: TransactionFuelType
  prist: boolean
  requested_for: string | null
  fuel_request: string | null
}

/** The slice of a fuel_transaction row the card and sheet read. */
export interface FlightFuelOrder {
  id: number
  status: FuelOrderStatus
  gallons_requested: string | number | null
  gallons_delivered: string | number | null
  fuel_type: TransactionFuelType | null
  prist: boolean
  requested_for: string | null
  fuel_request: string | null
  created_at: string
  updated_at: string
  /** Names of the assigned fuelers (relic fueler table until B122), newest assignment last. */
  fuelerNames: string[]
}

const toNumber = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** First letters of each word: "Tom Tanner" -> "TT". Empty for a blank name. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Validates the sheet and converts it to order fields. `refInstant` anchors "HH:mm" to a calendar day. */
export function parseFuelForm(
  form: FuelSheetForm,
  refInstant: Date,
  zone: string
): { ok: true; fields: FuelRequestFields } | { ok: false; error: string } {
  let gallons: number | null = null
  if (!form.topOff) {
    gallons = Number(form.gallons)
    if (!form.gallons.trim() || !Number.isFinite(gallons) || gallons <= 0) {
      return { ok: false, error: 'Enter the gallons wanted (more than zero), or choose Top off.' }
    }
  }
  let requestedFor: string | null = null
  if (form.time.trim()) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(form.time.trim())
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      return { ok: false, error: 'Enter the time wanted as hours and minutes.' }
    }
    const [y, mo, d] = formatLocalDate(refInstant, zone).split('-').map(Number)
    requestedFor = zonedTimeToInstant(y, mo, d, Number(m[1]), Number(m[2]), zone).toISOString()
  }
  const fuelType = toTransactionFuelType(
    form.fuelType === 'jet_a' && form.prist ? 'jet_a_plus' : form.fuelType
  )
  if (!fuelType) return { ok: false, error: 'Choose a fuel type.' }
  return {
    ok: true,
    fields: {
      gallons_requested: gallons,
      fuel_type: fuelType,
      prist: form.fuelType === 'jet_a' ? form.prist : false,
      requested_for: requestedFor,
      fuel_request: form.note.trim() || null
    }
  }
}

/** The sheet's starting values for an existing open order (edit); defaults for a new one. */
export function formFromOrder(order: FlightFuelOrder | null, zone: string): FuelSheetForm {
  if (!order) return EMPTY_FUEL_FORM
  const gallons = toNumber(order.gallons_requested)
  const kind = fromTransactionFuelType(order.fuel_type)
  return {
    topOff: gallons === null,
    gallons: gallons === null ? '' : String(gallons),
    fuelType: kind === 'avgas_100' ? 'avgas_100' : 'jet_a',
    prist: order.prist || order.fuel_type === 'jet_a_plus',
    time: order.requested_for ? formatLocalTime(new Date(order.requested_for), zone) : '',
    note: order.fuel_request ?? ''
  }
}

/** Editing the request fields is allowed only while the order is open (requested, assigned, fueling). */
export function assertEditable(status: FuelOrderStatus): void {
  if (!isOpenFuelOrder(status)) {
    throw new FuelOrderTransitionError(`Cannot edit a fuel order that is ${status}`)
  }
}

export type FuelChipTone = 'info' | 'progress' | 'done' | 'warn' | 'muted'

export interface FuelChip {
  text: string
  tone: FuelChipTone
}

const fmtGal = (n: number) => `${Number.isInteger(n) ? n : Number(n.toFixed(1))} gal`

/** The order that speaks for the flight: an open one first, then the latest filled, then the latest cancelled. */
export function pickCardOrder(orders: readonly FlightFuelOrder[]): FlightFuelOrder | null {
  const newest = (list: FlightFuelOrder[]) =>
    [...list].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0] ?? null
  return (
    newest(orders.filter((o) => isOpenFuelOrder(o.status))) ??
    newest(orders.filter((o) => o.status === 'filled')) ??
    newest(orders.filter((o) => o.status === 'cancelled'))
  )
}

/** The chip text and tone from the order status alone; null when the flight has no order. */
export function fuelChip(order: FlightFuelOrder | null): FuelChip | null {
  if (!order) return null
  switch (order.status) {
    case 'requested':
      return { text: 'Fuel requested', tone: 'info' }
    case 'assigned': {
      const initials = order.fuelerNames.map(initialsOf).filter(Boolean).join(' ')
      return { text: initials ? `Fuel assigned ${initials}` : 'Fuel assigned', tone: 'info' }
    }
    case 'fueling':
      return { text: 'Fueling', tone: 'progress' }
    case 'filled': {
      const delivered = toNumber(order.gallons_delivered) ?? 0
      const wanted = toNumber(order.gallons_requested)
      if (wanted !== null && delivered < wanted) {
        return { text: `Short: filled ${fmtGal(delivered)} of ${fmtGal(wanted)}`, tone: 'warn' }
      }
      return { text: `Filled ${fmtGal(delivered)}`, tone: 'done' }
    }
    case 'cancelled':
      return { text: 'Fuel cancelled', tone: 'muted' }
  }
}
