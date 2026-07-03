'use client'

import { createClient } from '@/lib/supabase/client'
import { findAllAircraft, createAircraft } from '@/repositories/aircraft.repo'
import { createFlight } from '@/repositories/flights.repo'
import type { FlightInsert } from '@/repositories/flights.repo'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { OcrExtractResult, ExtractedFlight } from '@/app/api/ocr/extract/route'

export type { ExtractedFlight }

export interface ReviewFlight extends ExtractedFlight {
  id: string               // local key for editing
  include: boolean         // user can uncheck to skip
  aircraftKnown?: boolean  // populated after validation
}

// Combine a date string "YYYY-MM-DD" with a time "HH:MM" → ISO
function toIso(date: string, time: string): string {
  if (!time) return `${date}T00:00:00`
  return `${date}T${time}:00`
}

export function useAircraftList() {
  const db = createClient()
  return useQuery({
    queryKey: ['aircraft-all'],
    queryFn: () => findAllAircraft(db),
    staleTime: 5 * 60 * 1000,
  })
}

export function useOcrExtract() {
  return useMutation({
    mutationFn: async (file: File): Promise<OcrExtractResult> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr/extract', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? 'Extraction failed')
      }
      return res.json()
    },
  })
}

export function useOcrCommit() {
  const db = createClient()

  return useMutation({
    mutationFn: async ({
      flights,
      scheduleDate,
    }: {
      flights: ReviewFlight[]
      scheduleDate: string
    }) => {
      const toImport = flights.filter((f) => f.include && f.tail_number)

      // 1. Ensure all aircraft exist
      const existingAircraft = await findAllAircraft(db)
      const knownTails = new Set(existingAircraft.map((a) => a.tail_number))

      for (const f of toImport) {
        if (!knownTails.has(f.tail_number)) {
          await createAircraft(db, {
            tail_number: f.tail_number,
            aircraft_type_icao: f.aircraft_type_icao || undefined,
          })
          knownTails.add(f.tail_number)
        }
      }

      // 2. Create flight records
      const created: Awaited<ReturnType<typeof createFlight>>[] = []
      for (const f of toImport) {
        // departure_time is required; fall back to arrival_time if only that is provided
        const depTime = f.departure_time || f.arrival_time
        if (!depTime) continue

        const insert: FlightInsert = {
          aircraft_id: f.tail_number,
          departure_time: toIso(scheduleDate, depTime),
          arrival_time: f.arrival_time ? toIso(scheduleDate, f.arrival_time) : null,
          call_sign: f.call_sign || null,
          origin: f.origin || '',
          destination: f.destination || '',
          flight_status: 'scheduled',
          created_by_source: 'front-desk',
        }
        created.push(await createFlight(db, insert))
      }

      return created
    },
  })
}
