'use client'

import { useSession } from '@/hooks/use-session'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface EditPeer {
  /** Stable identity used to de-dupe/exclude ourselves. Not necessarily the DB user id. */
  key: string
  name: string
}

export type SaveOutcome<T> =
  | { status: 'saved'; data: T }
  | { status: 'conflict' }

export type ConflictChoice = 'reload' | 'overwrite'

export interface UseRecordEditSessionOptions<
  TRow extends Record<string, unknown>
> {
  /** Table name, used for the realtime channel and (on reload) a direct refetch. */
  table: string
  /** Primary key column name. Defaults to 'id'. */
  idColumn?: string
  /** Column that changes on every write. Defaults to 'modified_at' (this codebase's convention). */
  modifiedAtColumn?: string
  /** The record's id. Pass null/undefined while creating a new record (no session is started). */
  recordId: string | number | null | undefined
  /** The value of `modifiedAtColumn` as loaded into the form. Pass null/undefined for new records. */
  modifiedAt: string | null | undefined
  /** Only track presence / subscribe while the Sheet/dialog is actually open for this record. */
  enabled: boolean
  /**
   * Called with the freshly-fetched row after the user chooses "reload" (either from the
   * live-change banner or the save-time conflict dialog). Use it to repopulate form state.
   */
  onReload?: (freshRow: TRow) => void
}

export interface UseRecordEditSessionResult<
  TRow extends Record<string, unknown>
> {
  /** Other users currently editing this same record (presence). */
  peers: EditPeer[]
  /** A postgres_changes UPDATE landed for this record while the Sheet was open. */
  remoteChangeDetected: boolean
  /** Dismiss the live-change banner and keep editing (save will still guard via compare-and-swap). */
  dismissRemoteChange: () => void
  /** A save-time compare-and-swap came back with zero rows — someone saved in between. */
  conflict: boolean
  /**
   * Wrap a save call. `saveFn` receives the expected `modifiedAt` to use as the
   * compare-and-swap guard (undefined means "write unconditionally"). If the
   * underlying write throws ConcurrencyConflictError, this resolves to
   * `{ status: 'conflict' }` and flips `conflict` to true instead of rethrowing.
   */
  save: <T>(
    saveFn: (expectedModifiedAt?: string) => Promise<T>
  ) => Promise<SaveOutcome<T>>
  /** Resolve an active conflict (from either the banner or the dialog). */
  resolveConflict: (choice: ConflictChoice) => Promise<void>
  /** True while a "reload" fetch is in flight. */
  reloading: boolean
}

interface PresencePayload {
  name: string
  online_at: string
}

function getDisplayName(
  session: ReturnType<typeof useSession>['data']
): string {
  const user = session?.user
  if (!user) return 'Someone'
  const metadata = user.user_metadata as Record<string, unknown> | undefined
  const firstName =
    typeof metadata?.first_name === 'string' ? metadata.first_name : ''
  const lastName =
    typeof metadata?.last_name === 'string' ? metadata.last_name : ''
  const fullName = `${firstName} ${lastName}`.trim()
  if (fullName) return fullName
  return user.email ?? 'Someone'
}

export function useRecordEditSession<TRow extends Record<string, unknown>>(
  options: UseRecordEditSessionOptions<TRow>
): UseRecordEditSessionResult<TRow> {
  const { table, recordId, modifiedAt, enabled, onReload } = options
  const idColumn = options.idColumn ?? 'id'
  const modifiedAtColumn = options.modifiedAtColumn ?? 'modified_at'

  const db = useMemo(() => createClient(), [])
  const { data: session } = useSession()
  const displayName = getDisplayName(session)

  // Stable per-mount identity so we can exclude ourselves from the peer list.
  const selfKeyRef = useRef<string>(
    session?.user?.id ?? Math.random().toString(36).slice(2)
  )

  const [peers, setPeers] = useState<EditPeer[]>([])
  const [remoteChangeDetected, setRemoteChangeDetected] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [reloading, setReloading] = useState(false)

  const baselineRef = useRef<string | null>(modifiedAt ?? null)
  const pendingSaveRef = useRef<
    ((expectedModifiedAt?: string) => Promise<unknown>) | null
  >(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Reset baseline whenever the record we're pointed at (or its loaded modifiedAt) changes.
  // recordId is intentionally included even though unread: switching to a different
  // record must reset state even in the (astronomically unlikely) case its modifiedAt
  // string happens to match the previous one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recordId included intentionally, see above
  useEffect(() => {
    baselineRef.current = modifiedAt ?? null
    setConflict(false)
    setRemoteChangeDetected(false)
  }, [recordId, modifiedAt])

  useEffect(() => {
    if (!enabled || recordId === null || recordId === undefined) {
      setPeers([])
      return
    }

    let cancelled = false
    const channelName = `edit-session:${table}:${recordId}`
    let channel: RealtimeChannel

    try {
      channel = db.channel(channelName, {
        config: { presence: { key: selfKeyRef.current } }
      })
    } catch (err) {
      // Presence/realtime is a nice-to-have — never let it break the edit form.
      console.warn(
        `[use-record-edit-session] failed to create channel ${channelName}`,
        err
      )
      return
    }

    channel
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = channel.presenceState<PresencePayload>()
          const others: EditPeer[] = []
          for (const key of Object.keys(state)) {
            if (key === selfKeyRef.current) continue
            const entries = state[key]
            const latest = entries[entries.length - 1]
            if (latest) others.push({ key, name: latest.name })
          }
          if (!cancelled) setPeers(others)
        } catch (err) {
          console.warn(
            '[use-record-edit-session] failed to read presence state',
            err
          )
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter: `${idColumn}=eq.${recordId}`
        },
        (payload: { new?: Record<string, unknown> }) => {
          const newModifiedAt = payload.new?.[modifiedAtColumn]
          if (
            typeof newModifiedAt === 'string' &&
            newModifiedAt !== baselineRef.current &&
            !cancelled
          ) {
            setRemoteChangeDetected(true)
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              name: displayName,
              online_at: new Date().toISOString()
            } satisfies PresencePayload)
          } catch (err) {
            console.warn(
              '[use-record-edit-session] failed to track presence',
              err
            )
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            `[use-record-edit-session] realtime channel ${channelName} status: ${status}`
          )
        }
      })

    channelRef.current = channel

    return () => {
      cancelled = true
      channel.untrack().catch(() => undefined)
      db.removeChannel(channel)
      if (channelRef.current === channel) channelRef.current = null
      setPeers([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, recordId, table, idColumn, modifiedAtColumn, db, displayName])

  const dismissRemoteChange = useCallback(
    () => setRemoteChangeDetected(false),
    []
  )

  const save = useCallback(
    async <T>(
      saveFn: (expectedModifiedAt?: string) => Promise<T>
    ): Promise<SaveOutcome<T>> => {
      pendingSaveRef.current = saveFn as (
        expectedModifiedAt?: string
      ) => Promise<unknown>
      try {
        const data = await saveFn(baselineRef.current ?? undefined)
        const row = data as unknown as
          | Record<string, unknown>
          | null
          | undefined
        const nextModifiedAt = row?.[modifiedAtColumn]
        if (typeof nextModifiedAt === 'string')
          baselineRef.current = nextModifiedAt
        setConflict(false)
        return { status: 'saved', data }
      } catch (err) {
        if (err instanceof ConcurrencyConflictError) {
          setConflict(true)
          return { status: 'conflict' }
        }
        throw err
      }
    },
    [modifiedAtColumn]
  )

  const resolveConflict = useCallback(
    async (choice: ConflictChoice) => {
      // Not a full audit trail — just don't let the choice vanish silently.
      console.info(
        `[use-record-edit-session] conflict on ${table}:${recordId} resolved as "${choice}"`
      )

      if (choice === 'reload') {
        if (recordId === null || recordId === undefined) return
        setReloading(true)
        try {
          // biome-ignore lint/suspicious/noExplicitAny: table is a runtime string; this hook is intentionally schema-agnostic
          const { data, error } = await (db.from(table) as any)
            .select('*')
            .eq(idColumn, recordId)
            .single()
          if (!error && data) {
            const freshRow = data as TRow
            const freshModifiedAt = freshRow[modifiedAtColumn]
            if (typeof freshModifiedAt === 'string')
              baselineRef.current = freshModifiedAt
            onReload?.(freshRow)
          } else if (error) {
            console.warn('[use-record-edit-session] reload fetch failed', error)
          }
        } finally {
          setReloading(false)
          setConflict(false)
          setRemoteChangeDetected(false)
          pendingSaveRef.current = null
        }
        return
      }

      // Overwrite anyway: retry the last save with no compare-and-swap guard.
      const fn = pendingSaveRef.current
      setConflict(false)
      setRemoteChangeDetected(false)
      if (!fn) return
      const data = await fn(undefined)
      const row = data as unknown as Record<string, unknown> | null | undefined
      const nextModifiedAt = row?.[modifiedAtColumn]
      if (typeof nextModifiedAt === 'string')
        baselineRef.current = nextModifiedAt
      pendingSaveRef.current = null
    },
    [db, table, idColumn, modifiedAtColumn, recordId, onReload]
  )

  return {
    peers,
    remoteChangeDetected,
    dismissRemoteChange,
    conflict,
    save,
    resolveConflict,
    reloading
  }
}
