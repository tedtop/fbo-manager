// Cypress tasks for the settings specs. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const settingsTasks = {
  /** app_setting.value for a key; null when the row does not exist. */
  async getAppSetting(key: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('app_setting').select('value').eq('key', key).maybeSingle()
    if (error) throw new Error(`getAppSetting: ${error.message}`)
    return data?.value ?? null
  },

  /** Upserts one app_setting row; value null deletes the row (restores "never set"). */
  async setAppSetting({ key, value }: { key: string; value: string | null }) {
    const db = createE2EDbClient()
    const { error } =
      value === null
        ? await db.from('app_setting').delete().eq('key', key)
        : await db.from('app_setting').upsert({ key, value }, { onConflict: 'key' })
    if (error) throw new Error(`setAppSetting: ${error.message}`)
    return null
  },
}
