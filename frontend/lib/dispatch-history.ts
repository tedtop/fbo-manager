// Appends every QT dispatch snapshot to fuel_dispatch_history, as Minuteman's api/dispatch.js does:
// one row per (transaction_id, change_flags), duplicates ignored, so the table accumulates the
// edit trail of every dispatch. The table is shared with Minuteman (both write the same rows,
// which the unique key makes harmless). Best effort: a failure is logged, never shown.
import { createAdminClient } from '@/lib/supabase/admin'
import type { QTDispatch } from '@/types/qt-dispatch'

// QT's "YYYY-MM-DD HH:MM" local time -> ISO, as Minuteman's parseQtDate does (the server's own zone
// applies, the same as the other app's server). QT's "0001-01-01" placeholder becomes null.
function qtIso(value: string | undefined): string | null {
  if (!value || value.startsWith('0001-01-01')) return null
  const date = new Date(`${value.replace(' ', 'T')}:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

type RawDispatch = QTDispatch & {
  Density?: number
  TransactionStatusID?: number
}

export function historyRows(dispatches: RawDispatch[]) {
  return dispatches
    .filter((d) => d.TransactionID)
    .map((d) => ({
      transaction_id: String(d.TransactionID),
      change_flags: d.ChangeFlags ?? 0,
      flight_number: d.FlightNumber || null,
      tail_number: d.TailNumber || null,
      aircraft_type: d.AircraftType || null,
      airline_icao_code: d.AirlineIcaoCode || null,
      destination: d.Destination || null,
      quantity: d.Quantity ?? null,
      quantity_in_weight: d.QuantityInWeight ?? null,
      density: d.Density ?? null,
      transaction_status_id: d.TransactionStatusID ?? null,
      arrival_date: qtIso(d.ArrivalDate),
      departure_date: qtIso(d.DepartureDate)
    }))
}

// Each poll repeats the same rows; skip the write when nothing new appeared since the last one.
let lastSignature = ''

export async function recordDispatchHistory(dispatches: RawDispatch[] | undefined): Promise<void> {
  if (!dispatches?.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const rows = historyRows(dispatches)
  const signature = rows.map((r) => `${r.transaction_id}:${r.change_flags}`).join('|')
  if (!rows.length || signature === lastSignature) return

  try {
    // fuel_dispatch_history is a live table written by Minuteman and absent from the generated types.
    const { error } = await (createAdminClient() as any)
      .from('fuel_dispatch_history')
      .upsert(rows, { onConflict: 'transaction_id,change_flags', ignoreDuplicates: true })
    if (error) console.error('fuel_dispatch_history write error:', error.message)
    else lastSignature = signature
  } catch (error) {
    console.error('fuel_dispatch_history write failed:', error instanceof Error ? error.message : error)
  }
}
