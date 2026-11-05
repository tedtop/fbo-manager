'use client'

import { useMemo } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useServices } from '@/hooks/use-services'
import { useAircraft } from '@/hooks/use-aircraft'
import { useAirportSettings } from '@/hooks/use-airports'
import type { ReviewEvaluation, ScheduleReviewItem, TailTypeLookup } from '@/lib/schedule-import/review'
import type { ImportSummary } from '@/lib/schedule-import/review'
import { ScheduleReviewCard } from './schedule-review-card'

interface ScheduleReviewProps {
  items: ScheduleReviewItem[]
  evaluations: ReviewEvaluation[]
  lookups: Record<string, TailTypeLookup>
  summary: ImportSummary
  canImport: boolean
  importing: boolean
  onChange: (id: string, patch: Partial<ScheduleReviewItem>) => void
  onUnpair: (id: string) => void
  onImport: () => void
  onCancel: () => void
}

export function ScheduleReview({ items, evaluations, lookups, summary, canImport, importing, onChange, onUnpair, onImport, onCancel }: ScheduleReviewProps) {
  const { services } = useServices()
  const options = services.map((s) => ({ key: s.key, label: s.label }))
  const { aircraft } = useAircraft()
  const { homeCountry, displayPreference } = useAirportSettings()
  // How often each type is already used on the board: the type picker lists those first.
  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of aircraft) {
      const code = a.aircraft_type_icao?.toUpperCase()
      if (code && code !== 'UNKN') counts[code] = (counts[code] ?? 0) + 1
    }
    return counts
  }, [aircraft])

  return (
    <div className="space-y-4">
      <div className="space-y-3" data-testid="schedule-review-list">
        {items.map((item, i) => (
          <ScheduleReviewCard
            key={item.id}
            item={item}
            evaluation={evaluations[i]}
            lookup={lookups[item.tail.trim().toUpperCase()]}
            usageCounts={usageCounts}
            homeCountry={homeCountry}
            displayPreference={displayPreference}
            services={options}
            disabled={importing}
            onChange={(patch) => onChange(item.id, patch)}
            onUnpair={() => onUnpair(item.id)}
          />
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border" data-testid="import-bar">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground" data-testid="import-summary">
            {summary.add} to add, {summary.update} to update, {summary.skip} skipped
            {summary.blocking > 0 && <span className="text-amber-700 dark:text-amber-400"> · {summary.blocking} flagged row{summary.blocking === 1 ? '' : 's'} to check</span>}
            {summary.lookupsPending > 0 && <span> · looking up aircraft types…</span>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1 sm:h-9 sm:flex-none" disabled={importing} onClick={onCancel}>
              Start over
            </Button>
            <Button type="button" className="h-11 flex-1 sm:h-9 sm:flex-none" disabled={!canImport || importing} onClick={onImport} data-testid="import-button">
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Import {summary.add + summary.update} flight{summary.add + summary.update === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
