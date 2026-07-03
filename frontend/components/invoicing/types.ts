import type {
  InvoiceStatus,
  PaymentMethod,
  TicketFuelType
} from '@/repositories/invoices.repo'
import type { ReadingPosition } from './ticket-math'

/** Draft rows hold raw input strings so partial entry never fights the user. */
export interface PositionReadingDraft {
  key: string
  position: ReadingPosition
  start: string
  end: string
}

export interface ServiceLineDraft {
  key: string
  itemType: 'service' | 'fee' | 'product'
  productId: number | null
  description: string
  quantity: string
  unitPrice: string
}

let draftCounter = 0
export function draftKey(): string {
  draftCounter += 1
  return `draft-${draftCounter}`
}

/** Checkbox labels exactly as printed on the paper ticket. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'CASH',
  eom: 'E.O.M.',
  roa: 'R.O.A.',
  check: 'CHECK',
  credit_card: 'CREDIT CARD'
}

export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  cash: 'Paid now',
  eom: 'Bill to account, end of month',
  roa: 'Receipt on account',
  check: 'Paid now by check',
  credit_card: 'Paid now by card'
}

export const FUEL_TYPE_TICKET_LABELS: Record<TicketFuelType, string> = {
  jet_a: 'JET',
  avgas_100: '100',
  avgas_80: '80',
  unleaded: 'UNLEADED'
}

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  open: 'On Account',
  paid: 'Paid',
  void: 'Void'
}

export const STATUS_BADGE_CLASSES: Record<InvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-transparent',
  open: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  paid: 'bg-green-500/15 text-green-500 border-green-500/30',
  void: 'bg-destructive/10 text-destructive border-destructive/30'
}

export const FBO_HEADER = {
  name: 'Minuteman Aviation, Inc.',
  address: '5225 Highway 10 West · Missoula, MT 59808',
  phone: '(406) 728-3113'
}
