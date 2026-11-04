import type { Database, JsonValue, Tables } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AppSettingRow = Tables<'app_setting'>

export async function findAllAppSettings(
  db: SupabaseClient<Database>
): Promise<AppSettingRow[]> {
  const { data, error } = await db.from('app_setting').select('*').order('key')
  if (error) throw error
  return data ?? []
}

// Insert-or-update by key. Who changed it and when are filled in by the table's trigger.
export async function upsertAppSetting(
  db: SupabaseClient<Database>,
  key: string,
  value: JsonValue
): Promise<AppSettingRow> {
  const { data, error } = await db
    .from('app_setting')
    .upsert({ key, value }, { onConflict: 'key' })
    .select('*')
    .single()
  if (error) throw error
  return data
}
