import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'
import type { GapReason, MeterGap } from '@/lib/meter-gaps'

export type MeterGapAnnotationRow = Tables<'meter_gap_annotation'>

export async function findAnnotationsForTruck(db: SupabaseClient<Database>, equipmentId: number): Promise<MeterGapAnnotationRow[]> {
  const { data, error } = await db.from('meter_gap_annotation').select('*').eq('fuel_truck_id', equipmentId)
  if (error) throw error
  return data
}

/** Identity of the gap an annotation belongs to, matching MeterGap.id (`front:r12`, `rear:s5`). */
export const annotationGapId = (a: Pick<MeterGapAnnotationRow, 'meter' | 'to_reading_id' | 'to_sheet_id'>) =>
  `${a.meter}:${a.to_reading_id != null ? `r${a.to_reading_id}` : `s${a.to_sheet_id}`}`

export interface AnnotationInput {
  reason: GapReason | null
  note: string | null
  resolved: boolean
}

/** Creates or updates the annotation of one gap. The gap's numbers are stored as a snapshot. */
export async function saveGapAnnotation(
  db: SupabaseClient<Database>,
  equipmentId: number,
  gap: MeterGap,
  input: AnnotationInput,
  existing?: MeterGapAnnotationRow
): Promise<MeterGapAnnotationRow> {
  const fields = {
    reason: input.reason,
    note: input.note?.trim() ? input.note.trim() : null,
    resolved: input.resolved,
    resolved_at: input.resolved ? (existing?.resolved ? existing.resolved_at : new Date().toISOString()) : null
  }
  if (existing) {
    const { data, error } = await db.from('meter_gap_annotation').update(fields).eq('id', existing.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await db
    .from('meter_gap_annotation')
    .insert({
      fuel_truck_id: equipmentId,
      meter: gap.meter,
      to_reading_id: gap.toReadingId,
      to_sheet_id: gap.toSheetId,
      expected_start: gap.expectedStart,
      actual_start: gap.actualStart,
      ...fields
    })
    .select()
    .single()
  if (error) throw error
  return data
}
