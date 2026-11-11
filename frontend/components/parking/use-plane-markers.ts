'use client'

import {
  type MoveKeys,
  type ParkedPlane,
  type PlanePose,
  iconPixelSize,
  normalizeHeading,
  roundCoordinate,
  stepPose,
  toStoredHeading
} from '@/lib/parking-map'
import { popPose, pushPose } from '@/lib/parking-undo'
import { type Map as MapLibreMap, Marker } from 'maplibre-gl'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { aircraftIconUrl } from './aircraft-icon'

export const SAVE_DELAY_MS = 1000
const PUBLISH_INTERVAL_MS = 100
const MIN_LABEL_ICON_PX = 16

type Entry = {
  marker: Marker
  el: HTMLDivElement
  img: HTMLImageElement
  label: HTMLSpanElement
  typeIcao: string
  selected: boolean
}

type Options = {
  mapRef: RefObject<MapLibreMap | null>
  loaded: boolean
  planes: readonly ParkedPlane[]
  /** Operations mode: planes can be dragged and moved with the keyboard. */
  interactive: boolean
  selectedTail: string | null
  /** `open` asks the host to show the details sheet (a click, as opposed to starting a drag). */
  onSelect: (tailNumber: string | null, options: { open: boolean }) => void
  /** Persists a pose. Must throw on failure. */
  onPersist: (tailNumber: string, pose: PlanePose) => Promise<void>
  onSaveError: (tailNumber: string, err: unknown) => void
}

const ARROW_KEYS: Record<string, keyof MoveKeys> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable ||
    target.getAttribute('role') === 'slider'
  )
}

/**
 * Keeps one draggable aircraft marker per parked plane and the local editing state around
 * it. The marker is the source of truth for its position while a plane is being moved or has
 * an unsaved change ("dirty"); server refetches never overwrite a dirty marker, so nothing
 * snaps back mid-drag. Saves are debounced per plane.
 */
export function usePlaneMarkers({
  mapRef,
  loaded,
  planes,
  interactive,
  selectedTail,
  onSelect,
  onPersist,
  onSaveError
}: Options) {
  const entriesRef = useRef(new Map<string, Entry>())
  const dirtyRef = useRef(new Map<string, number>())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const undoRef = useRef(new Map<string, PlanePose[]>())
  const suppressClickRef = useRef(false)
  const selectedRef = useRef(selectedTail)
  const onSelectRef = useRef(onSelect)
  const onPersistRef = useRef(onPersist)
  const onSaveErrorRef = useRef(onSaveError)
  selectedRef.current = selectedTail
  onSelectRef.current = onSelect
  onPersistRef.current = onPersist
  onSaveErrorRef.current = onSaveError

  const [pending, setPending] = useState(0)
  const [selectedPose, setSelectedPose] = useState<PlanePose | null>(null)

  const poseOf = useCallback((tailNumber: string): PlanePose | null => {
    const entry = entriesRef.current.get(tailNumber)
    if (!entry) return null
    const { lat, lng } = entry.marker.getLngLat()
    return { lat, lng, heading: normalizeHeading(entry.marker.getRotation()) }
  }, [])

  const publish = useCallback(
    (tailNumber: string) => {
      if (tailNumber === selectedRef.current)
        setSelectedPose(poseOf(tailNumber))
    },
    [poseOf]
  )

  const layoutEntry = useCallback(
    (tailNumber: string, entry: Entry, bearing: number, zoom: number) => {
      const { lat } = entry.marker.getLngLat()
      const { width, height } = iconPixelSize(entry.typeIcao, lat, zoom)
      entry.img.style.width = `${width}px`
      entry.img.style.height = `${height}px`
      const selected = tailNumber === selectedRef.current
      if (entry.selected !== selected) {
        entry.selected = selected
        entry.img.src = aircraftIconUrl(selected)
        entry.el.style.zIndex = selected ? '1' : ''
        entry.el.style.filter = selected
          ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.9))'
          : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))'
      }
      // Keep the tail number upright on screen however the plane and the map are turned.
      const screenHeading = entry.marker.getRotation() - bearing
      entry.label.style.transform = `translate(-50%, -50%) rotate(${-screenHeading}deg)`
      entry.label.style.display =
        Math.min(width, height) < MIN_LABEL_ICON_PX ? 'none' : 'block'
    },
    []
  )

  const layoutAll = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const bearing = map.getBearing()
    const zoom = map.getZoom()
    entriesRef.current.forEach((entry, tail) =>
      layoutEntry(tail, entry, bearing, zoom)
    )
  }, [mapRef, layoutEntry])

  // --- dirty tracking and debounced saving -------------------------------------------

  const markDirty = useCallback((tailNumber: string) => {
    dirtyRef.current.set(
      tailNumber,
      (dirtyRef.current.get(tailNumber) ?? 0) + 1
    )
    setPending(dirtyRef.current.size)
  }, [])

  const flush = useCallback(
    async (tailNumber: string) => {
      const timer = timersRef.current.get(tailNumber)
      if (timer) clearTimeout(timer)
      timersRef.current.delete(tailNumber)
      const version = dirtyRef.current.get(tailNumber)
      const pose = poseOf(tailNumber)
      if (version === undefined || !pose) {
        dirtyRef.current.delete(tailNumber)
        setPending(dirtyRef.current.size)
        return
      }
      try {
        await onPersistRef.current(tailNumber, {
          lat: roundCoordinate(pose.lat),
          lng: roundCoordinate(pose.lng),
          heading: toStoredHeading(pose.heading)
        })
      } catch (err) {
        onSaveErrorRef.current(tailNumber, err)
      } finally {
        // A newer change keeps the plane dirty until its own save completes.
        if (dirtyRef.current.get(tailNumber) === version) {
          dirtyRef.current.delete(tailNumber)
          setPending(dirtyRef.current.size)
        }
      }
    },
    [poseOf]
  )

  /** Resolves once any unsaved change for the plane has been written. */
  const flushPending = useCallback(
    async (tailNumber: string) => {
      if (dirtyRef.current.has(tailNumber)) await flush(tailNumber)
    },
    [flush]
  )

  const scheduleSave = useCallback(
    (tailNumber: string) => {
      const existing = timersRef.current.get(tailNumber)
      if (existing) clearTimeout(existing)
      timersRef.current.set(
        tailNumber,
        setTimeout(() => void flush(tailNumber), SAVE_DELAY_MS)
      )
    },
    [flush]
  )

  const applyPose = useCallback((tailNumber: string, pose: PlanePose) => {
    const entry = entriesRef.current.get(tailNumber)
    if (!entry) return
    entry.marker.setLngLat([pose.lng, pose.lat])
    entry.marker.setRotation(pose.heading)
  }, [])

  /** Changes made through the host UI (the heading control). */
  const setHeading = useCallback(
    (tailNumber: string, heading: number) => {
      const pose = poseOf(tailNumber)
      if (!pose) return
      applyPose(tailNumber, { ...pose, heading })
      markDirty(tailNumber)
      scheduleSave(tailNumber)
      layoutAll()
      publish(tailNumber)
    },
    [poseOf, applyPose, markDirty, scheduleSave, layoutAll, publish]
  )

  const undo = useCallback(
    (tailNumber: string) => {
      const { stack, pose } = popPose(undoRef.current.get(tailNumber) ?? [])
      undoRef.current.set(tailNumber, stack)
      if (!pose) return
      applyPose(tailNumber, pose)
      markDirty(tailNumber)
      scheduleSave(tailNumber)
      layoutAll()
      publish(tailNumber)
    },
    [applyPose, markDirty, scheduleSave, layoutAll, publish]
  )

  const rememberForUndo = useCallback(
    (tailNumber: string) => {
      const pose = poseOf(tailNumber)
      if (!pose) return
      undoRef.current.set(
        tailNumber,
        pushPose(undoRef.current.get(tailNumber) ?? [], pose)
      )
    },
    [poseOf]
  )

  // --- unsaved changes: flush on unmount, warn on page leave ----------------------------
  // Declared before the marker effect so it runs first when the component unmounts.
  useEffect(() => {
    const timers = timersRef.current
    const dirty = dirtyRef.current
    const flushAll = () => {
      for (const tail of [...dirty.keys()]) void flush(tail)
    }
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.size === 0) return
      flushAll()
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      for (const timer of timers.values()) clearTimeout(timer)
      flushAll()
    }
  }, [flush])

  // --- marker lifecycle ---------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    map.on('zoom', layoutAll)
    map.on('move', layoutAll)
    map.on('rotate', layoutAll)
    return () => {
      map.off('zoom', layoutAll)
      map.off('move', layoutAll)
      map.off('rotate', layoutAll)
    }
  }, [mapRef, loaded, layoutAll])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const entries = entriesRef.current

    const createEntry = (plane: ParkedPlane): Entry => {
      const tail = plane.tailNumber
      const el = document.createElement('div')
      el.className = 'parking-plane'
      el.title = `${tail} - ${plane.typeDisplay}`
      el.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))'

      const img = document.createElement('img')
      img.alt = tail
      img.draggable = false
      img.style.display = 'block'
      img.src = aircraftIconUrl(false)
      el.appendChild(img)

      const label = document.createElement('span')
      label.textContent = tail
      Object.assign(label.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        color: '#ffffff',
        font: '700 11px/1 ui-sans-serif, system-ui, sans-serif',
        textShadow: '0 0 3px #000, 0 0 3px #000, 0 0 2px #000, 0 0 6px #000',
        whiteSpace: 'nowrap',
        pointerEvents: 'none'
      })
      el.appendChild(label)

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        if (suppressClickRef.current) return
        onSelectRef.current(tail, { open: true })
      })

      const marker = new Marker({
        element: el,
        draggable: false,
        rotation: plane.heading,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat([plane.lng, plane.lat])
        .addTo(map)

      marker.on('dragstart', () => {
        suppressClickRef.current = true
        rememberForUndo(tail)
        markDirty(tail)
        if (selectedRef.current !== tail) {
          onSelectRef.current(tail, { open: false })
        }
      })
      marker.on('dragend', () => {
        scheduleSave(tail)
        publish(tail)
        // The click that follows a drag release must not open the sheet.
        setTimeout(() => {
          suppressClickRef.current = false
        }, 50)
      })

      return {
        marker,
        el,
        img,
        label,
        typeIcao: plane.typeIcao,
        selected: false
      }
    }

    const seen = new Set<string>()
    for (const plane of planes) {
      seen.add(plane.tailNumber)
      let entry = entries.get(plane.tailNumber)
      if (!entry) {
        entry = createEntry(plane)
        entries.set(plane.tailNumber, entry)
      } else if (!dirtyRef.current.has(plane.tailNumber)) {
        entry.typeIcao = plane.typeIcao
        entry.marker.setLngLat([plane.lng, plane.lat])
        entry.marker.setRotation(plane.heading)
      }
      entry.marker.setDraggable(interactive)
      entry.el.style.cursor = interactive ? 'grab' : 'pointer'
    }
    for (const [tail, entry] of entries) {
      if (seen.has(tail)) continue
      entry.marker.remove()
      entries.delete(tail)
      dirtyRef.current.delete(tail)
      undoRef.current.delete(tail)
      const timer = timersRef.current.get(tail)
      if (timer) clearTimeout(timer)
      timersRef.current.delete(tail)
    }
    setPending(dirtyRef.current.size)

    layoutAll()
    setSelectedPose(selectedTail ? poseOf(selectedTail) : null)
  }, [
    mapRef,
    loaded,
    planes,
    interactive,
    selectedTail,
    layoutAll,
    poseOf,
    rememberForUndo,
    markDirty,
    scheduleSave,
    publish
  ])

  // Remove every marker when the component goes away.
  useEffect(() => {
    const entries = entriesRef.current
    return () => {
      for (const entry of entries.values()) entry.marker.remove()
      entries.clear()
    }
  }, [])

  // --- keyboard control of the selected plane -----------------------------------------

  useEffect(() => {
    const map = mapRef.current
    const tail = selectedTail
    if (!interactive || !tail) return
    // Arrow keys move the plane, not the map.
    map?.keyboard.disable()

    const keys: MoveKeys = { left: false, right: false, up: false, down: false }
    let raf = 0
    let last = 0
    let lastPublish = 0
    let before: PlanePose | null = null

    const anyKey = () => keys.left || keys.right || keys.up || keys.down

    const tick = (now: number) => {
      raf = 0
      const pose = poseOf(tail)
      if (!pose || !anyKey()) return
      const next = stepPose(pose, keys, (now - last) / 1000)
      last = now
      applyPose(tail, next)
      layoutAll()
      if (now - lastPublish > PUBLISH_INTERVAL_MS) {
        lastPublish = now
        publish(tail)
      }
      raf = requestAnimationFrame(tick)
    }

    const release = () => {
      keys.left = keys.right = keys.up = keys.down = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      if (before) {
        undoRef.current.set(
          tail,
          pushPose(undoRef.current.get(tail) ?? [], before)
        )
        before = null
        scheduleSave(tail)
        publish(tail)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo(tail)
        return
      }
      if (e.key === 'Escape') {
        onSelectRef.current(null, { open: false })
        return
      }
      const key = ARROW_KEYS[e.key]
      if (!key || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      if (!before) {
        before = poseOf(tail)
        markDirty(tail)
      }
      keys[key] = true
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const key = ARROW_KEYS[e.key]
      if (!key) return
      keys[key] = false
      if (!anyKey()) release()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      release()
      map?.keyboard.enable()
    }
  }, [
    mapRef,
    interactive,
    selectedTail,
    poseOf,
    applyPose,
    layoutAll,
    publish,
    markDirty,
    scheduleSave,
    undo
  ])

  return { pending, selectedPose, setHeading, flushPending }
}
