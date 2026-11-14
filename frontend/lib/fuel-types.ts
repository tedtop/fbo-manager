/**
 * One app-wide fuel type and its mapping to the four spellings stored in the database (D22, PLAN 4.1):
 *   - fuel_transaction.fuel_type:        jet_a | jet_a_plus | avgas
 *   - fuel_tank / truck_sheets.fuel_type: jet_a | avgas
 *   - invoice_line_items.fuel_type:       jet_a | avgas_100 | avgas_80 | unleaded
 * DB enums are not changed; this module is the only place that converts between them.
 */
export type FuelType = 'jet_a' | 'jet_a_plus' | 'avgas_100' | 'avgas_80' | 'unleaded'

export const FUEL_TYPES: readonly FuelType[] = [
  'jet_a',
  'jet_a_plus',
  'avgas_100',
  'avgas_80',
  'unleaded'
]

export type TransactionFuelType = 'jet_a' | 'jet_a_plus' | 'avgas'
export type SheetFuelType = 'jet_a' | 'avgas'
export type LineFuelType = 'jet_a' | 'avgas_100' | 'avgas_80' | 'unleaded'

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  jet_a: 'Jet A',
  jet_a_plus: 'Jet A+',
  avgas_100: 'Avgas 100LL',
  avgas_80: 'Avgas 80',
  unleaded: 'Unleaded'
}

/** A fuel_transaction row's value. Its single 'avgas' is 100LL, the grade this FBO sells. */
export function fromTransactionFuelType(
  value: TransactionFuelType | null | undefined
): FuelType | null {
  switch (value) {
    case 'jet_a':
    case 'jet_a_plus':
      return value
    case 'avgas':
      return 'avgas_100'
    default:
      return null
  }
}

/** The fuel_transaction value, or null when that table has no spelling for it (unleaded). */
export function toTransactionFuelType(fuel: FuelType): TransactionFuelType | null {
  switch (fuel) {
    case 'jet_a':
    case 'jet_a_plus':
      return fuel
    case 'avgas_100':
    case 'avgas_80':
      return 'avgas'
    case 'unleaded':
      return null
  }
}

/** A truck sheet or fuel tank value. Jet A+ is Jet A with Prist, so it counts as jet_a. */
export function fromSheetFuelType(value: SheetFuelType | null | undefined): FuelType | null {
  switch (value) {
    case 'jet_a':
      return 'jet_a'
    case 'avgas':
      return 'avgas_100'
    default:
      return null
  }
}

export function toSheetFuelType(fuel: FuelType): SheetFuelType | null {
  switch (fuel) {
    case 'jet_a':
    case 'jet_a_plus':
      return 'jet_a'
    case 'avgas_100':
    case 'avgas_80':
      return 'avgas'
    case 'unleaded':
      return null
  }
}

/** An invoice line value. */
export function fromLineFuelType(value: LineFuelType | null | undefined): FuelType | null {
  return value ?? null
}

/** The invoice line value. Lines have no Jet A+: the Prist is its own line (PLAN 6). */
export function toLineFuelType(fuel: FuelType): LineFuelType {
  return fuel === 'jet_a_plus' ? 'jet_a' : fuel
}
