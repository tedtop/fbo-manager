import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { findUserByEmail } from '@/repositories/users.repo'

// B17: the signed-in Supabase auth user maps to the legacy integer `users` row by email (the same link
// useCurrentUser uses). Returns that row's id, or undefined when there is no session or no linked users row.
// Callers then OMIT created_by_id, so the database default applies (live: DEFAULT 1) rather than failing the
// create. That fallback is the only path left that attributes to the default user.
export async function resolveCreatorId(db: SupabaseClient<Database>): Promise<number | undefined> {
  const { data } = await db.auth.getSession()
  const email = data.session?.user?.email
  if (!email) return undefined
  try {
    const user = await findUserByEmail(db, email)
    return user?.id
  } catch {
    return undefined
  }
}
