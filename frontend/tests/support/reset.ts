import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { TEST_SUPABASE_URL, assertSafeTestTarget } from './client'

// Deletion order: children before parents, so FK constraints never block a wipe.
// Keep this in sync with frontend/supabase/migrations/*.sql.
const RESET_ORDER: Array<{ table: keyof Database['public']['Tables']; pk: string }> = [
  { table: 'invoice_fuel_readings', pk: 'id' },
  { table: 'invoice_line_items', pk: 'id' },
  { table: 'invoices', pk: 'id' },
  { table: 'truck_meter_readings', pk: 'id' },
  { table: 'truck_sheets', pk: 'id' },
  { table: 'invoice_item', pk: 'id' },
  { table: 'invoice', pk: 'id' },
  { table: 'product', pk: 'id' },
  { table: 'customer', pk: 'id' },
  { table: 'time_card_scan', pk: 'id' },
  { table: 'schedule_shift', pk: 'id' },
  { table: 'department_member', pk: 'id' },
  { table: 'department', pk: 'id' },
  { table: 'fueler_assignment', pk: 'id' },
  { table: 'assigned_training', pk: 'id' },
  { table: 'fueler_training_history', pk: 'id' },
  { table: 'fueler_training', pk: 'id' },
  { table: 'fuel_transaction', pk: 'id' },
  { table: 'flight', pk: 'id' },
  { table: 'training', pk: 'id' },
  { table: 'fueler', pk: 'id' },
  { table: 'equipment', pk: 'id' },
  { table: 'terminal_gate', pk: 'id' },
  { table: 'parking_location', pk: 'id' },
  { table: 'tank_level_readings', pk: 'id' },
  { table: 'fuel_tank', pk: 'tank_id' },
  { table: 'aircraft', pk: 'tail_number' },
  { table: 'users', pk: 'id' },
]

/**
 * Wipes every table used by the repository layer, in FK-safe order. Runs before each
 * test (see tests/support/setup.ts) so every test starts from a clean, empty database
 * instead of tagging/filtering rows in a shared dataset.
 */
export async function resetDatabase(db: SupabaseClient<Database>): Promise<void> {
  // Defense in depth: re-check the guard from client.ts even though createTestClient()
  // already checks it at construction time — this is the function that actually deletes
  // rows, so it re-validates independently rather than trusting the caller went through
  // the guarded factory.
  assertSafeTestTarget(TEST_SUPABASE_URL)

  for (const { table, pk } of RESET_ORDER) {
    const { error } = await db.from(table).delete().not(pk, 'is', null)
    if (error) {
      throw new Error(`resetDatabase: failed to clear "${table}": ${error.message}`)
    }
  }
}
