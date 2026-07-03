'use client'

import { createClient } from '@/lib/supabase/client'
import { createEquipment, findAllEquipment } from '@/repositories/equipment.repo'
import {
  createTruckMeterReadings,
  createTruckSheet,
  type TruckMeterReadingInsert,
} from '@/repositories/truck-sheets.repo'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ExtractedReading,
  ExtractedTruckSheet,
} from '@/app/api/ocr/truck-sheet/route'
import { truckSheetKeys } from '@/hooks/use-truck-sheets'

export type { ExtractedReading, ExtractedTruckSheet }

export interface ReviewReading extends ExtractedReading {
  id: string // local key for editing
  include: boolean
}

export interface ReviewSheet {
  id: string // local key
  sheet_date: string
  truck_number: string
  fuel_type: 'jet_a' | 'avgas' | ''
  gallons_down: string
  starting_gallons: string
  front_meter_start: string
  rear_meter_start: string
  fueler_initials: string
  page_count: number
  source_files: string[]
  ocr_raw: unknown[]
  readings: ReviewReading[]
}

export function toNumber(v: string): number | null {
  const n = Number.parseFloat(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}

let localId = 0
function nextId(prefix: string): string {
  localId += 1
  return `${prefix}-${localId}`
}

/**
 * Merge per-page extractions into one ReviewSheet per truck.
 * Pages of the same truck are ordered by front meter start (the register
 * only counts up during the day), falling back to upload order.
 */
export function mergeExtractions(
  pages: { file: File; extraction: ExtractedTruckSheet }[]
): ReviewSheet[] {
  const groups = new Map<string, { file: File; extraction: ExtractedTruckSheet }[]>()
  for (const page of pages) {
    const key = page.extraction.truck_number || page.file.name
    const group = groups.get(key) ?? []
    group.push(page)
    groups.set(key, group)
  }

  const sheets: ReviewSheet[] = []
  for (const [truckNumber, group] of groups) {
    group.sort((a, b) => {
      const am = toNumber(a.extraction.front_meter_start)
      const bm = toNumber(b.extraction.front_meter_start)
      if (am != null && bm != null) return am - bm
      return 0
    })
    const first = group[0].extraction
    sheets.push({
      id: nextId('sheet'),
      sheet_date: first.sheet_date ?? '',
      truck_number: truckNumber,
      fuel_type: first.fuel_type,
      gallons_down: first.gallons_down,
      starting_gallons: first.starting_gallons,
      front_meter_start: first.front_meter_start,
      rear_meter_start: first.rear_meter_start,
      fueler_initials: first.fueler_initials,
      page_count: group.length,
      source_files: group.map((p) => p.file.name),
      ocr_raw: group.map((p) => {
        const { raw_text: _rawText, ...extraction } = p.extraction
        return extraction
      }),
      readings: group.flatMap((p) =>
        p.extraction.readings.map((r) => ({
          ...r,
          id: nextId('reading'),
          include: true,
        }))
      ),
    })
  }
  return sheets.sort((a, b) => a.truck_number.localeCompare(b.truck_number))
}

export function useTruckSheetExtract() {
  return useMutation({
    mutationFn: async (file: File): Promise<ExtractedTruckSheet> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr/truck-sheet', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? 'Extraction failed')
      }
      return res.json()
    },
  })
}

export function useTruckSheetCommit() {
  const db = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sheets: ReviewSheet[]) => {
      // 1. Resolve fuel trucks in the equipment registry, auto-creating
      //    any truck number we haven't seen before
      const equipment = await findAllEquipment(db)
      const trucksById = new Map(
        equipment
          .filter((e) => e.equipment_type === 'fuel_truck')
          .map((e) => [e.equipment_id, e.id])
      )

      const created: number[] = []
      for (const sheet of sheets) {
        if (!sheet.truck_number || !sheet.sheet_date || !sheet.fuel_type) {
          throw new Error('Each sheet needs a truck number, date, and fuel type before import')
        }

        let fuelTruckId = trucksById.get(sheet.truck_number)
        if (fuelTruckId == null) {
          const truck = await createEquipment(db, {
            equipment_id: sheet.truck_number,
            equipment_name: `Fuel Truck ${sheet.truck_number}`,
            equipment_type: 'fuel_truck',
            notes: `Fuel: ${sheet.fuel_type === 'jet_a' ? 'Jet A' : 'Avgas 100LL'}. Auto-created by truck sheet import.`,
          })
          fuelTruckId = truck.id
          trucksById.set(sheet.truck_number, fuelTruckId)
        }

        // 2. Create the sheet header
        const sheetRow = await createTruckSheet(db, {
          sheet_date: sheet.sheet_date,
          fuel_truck_id: fuelTruckId,
          truck_number: sheet.truck_number,
          fuel_type: sheet.fuel_type,
          gallons_down: toNumber(sheet.gallons_down),
          starting_gallons: toNumber(sheet.starting_gallons),
          front_meter_start: toNumber(sheet.front_meter_start),
          rear_meter_start: toNumber(sheet.rear_meter_start),
          fueler_initials: sheet.fueler_initials || null,
          page_count: sheet.page_count,
          ocr_raw: sheet.ocr_raw,
        })

        // 3. Bulk-insert the meter readings
        const inserts: TruckMeterReadingInsert[] = sheet.readings
          .filter((r) => r.include)
          .map((r, idx) => ({
            truck_sheet_id: sheetRow.id,
            line_number: idx + 1,
            reading_type: r.reading_type,
            customer: r.customer || null,
            tail_number: r.tail_number || null,
            aircraft_type: r.aircraft_type || null,
            fuel_type_confirmed: r.fuel_type_confirmed,
            meter: r.meter || null,
            meter_start: toNumber(r.meter_start),
            meter_end: toNumber(r.meter_end),
            gallons_pumped: toNumber(r.gallons_pumped),
            gallons_remaining: toNumber(r.gallons_remaining),
            req_gals_or_lbs: r.req_gals_or_lbs || null,
            prist: r.prist === '' ? null : r.prist === 'yes',
            line_tech_initials: r.line_tech_initials || null,
            invoice_number: r.invoice_number || null,
            service_time: r.service_time || null,
            notes: r.notes || null,
          }))
        await createTruckMeterReadings(db, inserts)
        created.push(sheetRow.id)
      }

      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: truckSheetKeys.all })
    },
  })
}
