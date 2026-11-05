'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  findScansForTruckSheets,
  getScanSignedUrls,
  type ScannedDocumentRow,
} from '@/repositories/scanned-documents.repo'

export const scanKeys = {
  all: ['scanned-documents'] as const,
  sheets: (ids: number[]) => [...scanKeys.all, 'sheets', ids.join(',')] as const,
}

export interface PageScan extends ScannedDocumentRow {
  /** Signed URL of the upright page image (null if signing failed). */
  url: string | null
  /** Signed URL of the original upload as received, when there is one. */
  originalUrl: string | null
}

/** Page scans (upright images with signed URLs) of the given truck sheets, grouped by sheet id, in page order. */
export function useTruckSheetScans(sheetIds: number[]) {
  return useQuery({
    queryKey: scanKeys.sheets(sheetIds),
    enabled: sheetIds.length > 0,
    queryFn: async () => {
      const db = createClient()
      const rows = await findScansForTruckSheets(db, sheetIds)
      const paths = [...new Set(rows.flatMap((r) => [r.storage_path, r.original_path].filter((p): p is string => !!p)))]
      const urls = await getScanSignedUrls(db, paths)
      const bySheet = new Map<number, PageScan[]>()
      for (const row of rows) {
        if (row.truck_sheet_id == null) continue
        const list = bySheet.get(row.truck_sheet_id) ?? []
        list.push({
          ...row,
          url: urls.get(row.storage_path) ?? null,
          originalUrl: row.original_path ? (urls.get(row.original_path) ?? null) : null,
        })
        bySheet.set(row.truck_sheet_id, list)
      }
      return bySheet
    },
  })
}
