'use client'

// Schedule sheet import: upload -> extract (POST /api/ocr/schedule-sheet) -> review state -> write through flights.repo.
// The rules live in lib/schedule-import (pure, tested); this file is the glue: network, board lookup and the writes.

import { useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { describeError } from '@/lib/error-message'
import {
  buildReviewItems,
  canImport,
  evaluateReviewItems,
  existingFlightsRange,
  planImport,
  summarizeReview,
  unpairItem,
  type ImportOperation,
  type ReviewEvaluation,
  type ReviewExistingFlight,
  type ScheduleReviewItem,
  type TailTypeLookup
} from '@/lib/schedule-import/review'
import type { ExtractedScheduleSheet } from '@/lib/schedule-import/types'
import { findAircraftByTailNumber, createAircraft } from '@/repositories/aircraft.repo'
import { findAirportsByCodes } from '@/repositories/airports.repo'
import { airportKeys, useAirportSettings } from '@/hooks/use-airports'
import { airportCodeToLookUp } from '@/lib/schedule-import/resolve-airport'
import {
  createFlight,
  findAllFlights,
  serviceKeysFromRow,
  updateFlight,
  type FlightWithRelations
} from '@/repositories/flights.repo'
import { uploadScheduleSheetScan } from '@/repositories/scanned-documents.repo'
import { setFlightServices } from '@/repositories/services.repo'
import { flightKeys } from '@/hooks/use-flights'
import { aircraftKeys } from '@/hooks/use-aircraft'
import { aircraftLookupKeys, fetchLookup } from '@/hooks/use-aircraft-type-lookup'
import { formatIcaoType, findIcaoType } from '@/lib/icao-aircraft-types'
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '@/lib/local-date'
import { useAppSettings } from '@/hooks/use-app-settings'

export type ScheduleImportPhase = 'idle' | 'extracting' | 'ready' | 'importing' | 'done'

export interface ImportFailure {
  itemId: string
  tail: string
  message: string
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  failed: ImportFailure[]
}

/** POSTs the photos/PDF to the OCR route. Throws an Error carrying the route's message (400/500/502 all have `error`). */
export async function requestScheduleExtraction(files: File[]): Promise<ExtractedScheduleSheet> {
  const form = new FormData()
  for (const f of files) form.append('file', f)
  let res: Response
  try {
    res = await fetch('/api/ocr/schedule-sheet', { method: 'POST', body: form })
  } catch {
    throw new Error('Could not reach the server. Check the connection and try again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Extraction failed (HTTP ${res.status})`)
  }
  return res.json()
}

export function toExistingFlight(row: FlightWithRelations): ReviewExistingFlight {
  return {
    id: row.id,
    tail_number: row.tail_number,
    scheduled_arrival_time: row.scheduled_arrival_time,
    scheduled_departure_time: row.scheduled_departure_time,
    is_quick_turn: row.is_quick_turn,
    contact_name: row.contact_name,
    services: serviceKeysFromRow(row),
    deleted_at: row.deleted_at,
    updated_at: row.updated_at,
    notes: row.notes
  }
}

/** The database calls the import makes, injectable so the sequencing is testable without Supabase. */
export interface ImportDeps {
  aircraftExists: (tail: string) => Promise<boolean>
  createAircraft: (tail: string, display: string, icao: string) => Promise<void>
  createFlight: (insert: Extract<ImportOperation, { kind: 'add' }>['insert']) => Promise<number>
  updateFlight: (
    id: number,
    updates: Extract<ImportOperation, { kind: 'update' }>['updates'],
    expectedUpdatedAt: string | undefined
  ) => Promise<void>
  setServices: (flightId: number, keys: string[]) => Promise<void>
}

/** Runs the planned writes one by one; a failing row is recorded and the rest continue. Counts are of rows written. */
export async function executeImportOperations(
  ops: readonly ImportOperation[],
  tailOf: (itemId: string) => string,
  deps: ImportDeps
): Promise<{ added: number; updated: number; failed: ImportFailure[] }> {
  let added = 0
  let updated = 0
  const failed: ImportFailure[] = []
  const knownAircraft = new Set<string>()

  for (const op of ops) {
    try {
      if (op.kind === 'add') {
        // Aircraft first (flight.tail_number references it); an existing aircraft is left exactly as it is.
        if (!knownAircraft.has(op.tailNumber)) {
          if (!(await deps.aircraftExists(op.tailNumber))) {
            await deps.createAircraft(op.tailNumber, op.aircraftTypeDisplay, op.aircraftTypeIcao)
          }
          knownAircraft.add(op.tailNumber)
        }
        const id = await deps.createFlight(op.insert)
        added += 1
        if (op.serviceKeys.length > 0) {
          try {
            await deps.setServices(id, op.serviceKeys)
          } catch (err) {
            failed.push({ itemId: op.itemId, tail: tailOf(op.itemId), message: `Flight added, but its services were not saved: ${describeError(err)}` })
          }
        }
      } else {
        if (Object.keys(op.updates).length > 0) await deps.updateFlight(op.flightId, op.updates, op.expectedUpdatedAt)
        updated += 1
        if (op.serviceKeys) {
          try {
            await deps.setServices(op.flightId, op.serviceKeys)
          } catch (err) {
            failed.push({ itemId: op.itemId, tail: tailOf(op.itemId), message: `Flight updated, but its services were not saved: ${describeError(err)}` })
          }
        }
      }
    } catch (err) {
      failed.push({ itemId: op.itemId, tail: tailOf(op.itemId), message: describeError(err) })
    }
  }
  return { added, updated, failed }
}

export function useScheduleImport() {
  const db = createClient()
  const qc = useQueryClient()

  const [phase, setPhase] = useState<ScheduleImportPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [sheet, setSheet] = useState<ExtractedScheduleSheet | null>(null)
  const [items, setItems] = useState<ScheduleReviewItem[]>([])
  const [existing, setExisting] = useState<ReviewExistingFlight[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)

  // The Type column on the sheet is unreliable, so the type of each tail comes from the registry lookup (adsbdb,
  // /api/aircraft/lookup, the same service the flight form uses). One cached query per distinct tail.
  const tails = useMemo(() => [...new Set(items.map((i) => i.tail.trim().toUpperCase()).filter(Boolean))], [items])
  const lookupQueries = useQueries({
    queries: tails.map((tail) => ({
      queryKey: aircraftLookupKeys.tail(tail),
      queryFn: () => fetchLookup(tail),
      staleTime: 24 * 60 * 60 * 1000,
      retry: false
    }))
  })
  const lookups = useMemo(() => {
    const out: Record<string, TailTypeLookup> = {}
    tails.forEach((tail, i) => {
      const q = lookupQueries[i]
      if (!q || q.isFetching) out[tail] = { state: 'pending' }
      else if (q.data) {
        const known = findIcaoType(q.data.typeIcao)
        out[tail] = { state: 'found', icao: q.data.typeIcao, display: known ? formatIcaoType(known) : q.data.typeDescription }
      } else out[tail] = { state: 'none' } // unknown tail, failed lookup or error: leave the type empty
    })
    return out
    // biome-ignore lint/correctness/useExhaustiveDependencies: lookupQueries changes identity every render
  }, [tails, lookupQueries.map((q) => `${q.status}${q.fetchStatus}`).join()])

  // Printed origin / destination codes are matched against the airport table (one query for all of them); the stored
  // code is the ICAO code, like the flight form. Place names and ambiguous codes are left to the airport combobox.
  const { homeCountry } = useAirportSettings()
  // Printed times are wall clock at the FBO, so they follow the FBO time zone setting (not the per-user Zulu toggle).
  const { settings } = useAppSettings()
  const timeZone = isValidTimeZone(settings.timeZone) ? settings.timeZone : DEFAULT_TIME_ZONE
  const airportCodes = useMemo(
    () => [...new Set(items.flatMap((i) => [i.originPrinted, i.destinationPrinted]).map(airportCodeToLookUp).filter((c): c is string => !!c))].sort(),
    [items]
  )
  const airportQuery = useQuery({
    queryKey: airportKeys.labels(airportCodes),
    queryFn: () => findAirportsByCodes(db, airportCodes),
    enabled: airportCodes.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60 * 60 * 1000
  })
  const airports = airportQuery.data
  const airportsPending = airportCodes.length > 0 && airportQuery.isFetching

  const evaluations: ReviewEvaluation[] = useMemo(
    () => evaluateReviewItems(items, existing, { timeZone, lookups, airports: airports ?? [], homeCountry }),
    [items, existing, timeZone, lookups, airports, homeCountry]
  )
  const summary = useMemo(() => summarizeReview(evaluations), [evaluations])

  const upload = useCallback(
    async (picked: File[]) => {
      setPhase('extracting')
      setError(null)
      setResult(null)
      setFiles(picked)
      try {
        const extracted = await requestScheduleExtraction(picked)
        const built = buildReviewItems(extracted, { timeZone })
        // Flights already on the board over the sheet's span (hidden ones too), for the duplicate check.
        const range = existingFlightsRange(built)
        const rows = range ? await findAllFlights(db, { ...range, includeHidden: true }) : []
        setSheet(extracted)
        setItems(built)
        setExisting(rows.map(toExistingFlight))
        setPhase('ready')
        if (built.length === 0) setError('No flights were found on this sheet. Try a clearer photo.')
      } catch (err) {
        setPhase('idle')
        setError(describeError(err))
      }
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: db is a stable per-render client
    [timeZone]
  )

  const updateItem = useCallback((id: string, patch: Partial<ScheduleReviewItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const unpair = useCallback(
    (id: string) => {
      setItems((prev) => prev.flatMap((i) => (i.id === id ? unpairItem(i, sheet?.sheet_date ?? null, { timeZone }) : [i])))
    },
    [sheet, timeZone]
  )

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
    setFiles([])
    setSheet(null)
    setItems([])
    setExisting([])
    setResult(null)
  }, [])

  const importAll = useCallback(async (): Promise<ImportResult | null> => {
    if (!canImport(evaluations) || airportsPending) return null
    setPhase('importing')
    setError(null)
    const ops = planImport(items, evaluations, { timeZone })
    const tails = new Map(items.map((i) => [i.id, i.tail]))
    const done = await executeImportOperations(ops, (id) => tails.get(id) ?? '', {
      aircraftExists: async (tail) => (await findAircraftByTailNumber(db, tail)) !== null,
      createAircraft: async (tail, display, icao) => {
        await createAircraft(db, {
          tail_number: tail,
          aircraft_type_display: display,
          aircraft_type_icao: icao,
          airline_icao: '',
          fleet_id: ''
        })
      },
      createFlight: async (insert) => Number((await createFlight(db, insert)).id),
      updateFlight: async (id, updates, expectedUpdatedAt) => {
        await updateFlight(db, id, updates, expectedUpdatedAt)
      },
      setServices: async (flightId, keys) => {
        await setFlightServices(db, flightId, keys)
      }
    })

    // The original sheet is kept like truck sheets are: best effort, a storage hiccup never undoes the import.
    if (done.added + done.updated > 0) {
      for (const file of files) {
        try {
          await uploadScheduleSheetScan(db, file, file.name)
        } catch (err) {
          console.error(`Failed to persist original schedule sheet "${file.name}":`, err)
        }
      }
    }

    void qc.invalidateQueries({ queryKey: flightKeys.all })
    void qc.invalidateQueries({ queryKey: aircraftKeys.all })
    const res: ImportResult = {
      added: done.added,
      updated: done.updated,
      skipped: items.length - done.added - done.updated - done.failed.filter((f) => !f.message.includes('services were not saved')).length,
      failed: done.failed
    }
    setResult(res)
    setPhase('done')
    return res
    // biome-ignore lint/correctness/useExhaustiveDependencies: db is a stable per-render client
  }, [evaluations, items, files, qc, airportsPending, timeZone])

  return {
    phase,
    error,
    files,
    sheet,
    items,
    evaluations,
    lookups,
    summary,
    result,
    airportsPending,
    canImport: canImport(evaluations) && !airportsPending,
    upload,
    updateItem,
    unpair,
    importAll,
    reset
  }
}
