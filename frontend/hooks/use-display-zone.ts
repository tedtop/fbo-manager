'use client'

import { useAppSettings } from '@/hooks/use-app-settings'
import {
  ZULU_STORAGE_KEY,
  parseStoredZulu,
  resolveDisplayZone,
  zoneBannerText,
  zoneSuffix
} from '@/lib/display-zone'
import { useCallback, useSyncExternalStore } from 'react'

// The Zulu toggle is a per-user view preference (this browser), not a shared setting. A tiny external
// store keeps every component using the hook in step, and other tabs via the storage event.
const listeners = new Set<() => void>()
let memoryZulu = false

function readZulu(): boolean {
  try {
    return parseStoredZulu(window.localStorage.getItem(ZULU_STORAGE_KEY))
  } catch {
    return memoryZulu
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = (e: StorageEvent) => {
    if (e.key === ZULU_STORAGE_KEY || e.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function writeZulu(value: boolean) {
  memoryZulu = value
  try {
    window.localStorage.setItem(ZULU_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // storage blocked: the preference lasts until reload
  }
  for (const l of listeners) l()
}

export interface DisplayZone {
  /** IANA zone the board shows and filters in: 'UTC' in Zulu mode, else the FBO time zone setting. */
  zone: string
  /** The FBO's configured zone, regardless of Zulu mode. */
  fboZone: string
  isZulu: boolean
  setZulu: (value: boolean) => void
  /** Short suffix right now: "Z", "MST" or "MDT". Use `suffixAt` for a specific instant. */
  label: string
  /** Suffix for the instant of `timestamp` (an old flight may sit on the other side of a DST change). */
  suffixAt: (timestamp?: string) => string
  /** "Times in MST" / "Times in Zulu (UTC)". */
  banner: string
}

export function useDisplayZone(): DisplayZone {
  const { settings } = useAppSettings()
  const fboZone = settings.timeZone
  const isZulu = useSyncExternalStore(subscribe, readZulu, () => false)
  const zone = resolveDisplayZone(fboZone, isZulu)
  const suffixAt = useCallback(
    (timestamp?: string) =>
      zoneSuffix(timestamp ? new Date(timestamp) : new Date(), fboZone, isZulu),
    [fboZone, isZulu]
  )
  return {
    zone,
    fboZone,
    isZulu,
    setZulu: writeZulu,
    label: suffixAt(),
    suffixAt,
    banner: zoneBannerText(fboZone, isZulu)
  }
}
