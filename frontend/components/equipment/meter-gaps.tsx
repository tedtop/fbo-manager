'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useGapAnnotations, useSaveGapAnnotation, useTruckMeterGaps } from '@/hooks/use-meter-gaps'
import { GAP_REASONS, type GapReason, type MeterGap } from '@/lib/meter-gaps'
import { annotationGapId, type MeterGapAnnotationRow } from '@/repositories/meter-gaps.repo'
import { ErrorMessage } from '@/messages/error-message'

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })
const KIND_TEXT = {
  gap: 'Gallons not recorded',
  rollover: 'Meter rolled over between readings',
  overlap: 'Starts below the previous end (duplicate, typo or out of order)'
} as const

function GapRow({ gap, annotation, equipmentId }: { gap: MeterGap; annotation?: MeterGapAnnotationRow; equipmentId: number }) {
  const save = useSaveGapAnnotation(equipmentId)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<GapReason | ''>(annotation?.reason ?? '')
  const [note, setNote] = useState(annotation?.note ?? '')
  const resolved = annotation?.resolved ?? false

  const submit = (nextResolved: boolean) =>
    save.mutate(
      { gap, existing: annotation, input: { reason: reason || null, note, resolved: nextResolved } },
      { onSuccess: () => setOpen(false) }
    )

  return (
    <li className="space-y-2 py-3" data-testid={`meter-gap-${gap.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={resolved ? 'secondary' : 'destructive'}>{resolved ? 'Resolved' : 'Open'}</Badge>
        <span className="text-sm font-medium capitalize">{gap.meter} meter</span>
        <span className="text-xs text-muted-foreground">{gap.sheetDate}{gap.tail ? ` · ${gap.tail}` : ''}</span>
      </div>
      <p className="text-sm">
        {KIND_TEXT[gap.kind]}: ended at <span className="font-mono">{fmt(gap.expectedStart)}</span>, next started at{' '}
        <span className="font-mono">{fmt(gap.actualStart)}</span>{' '}
        (<span className="font-mono font-semibold">{gap.missingGallons > 0 ? `${fmt(gap.missingGallons)} gal missing` : `${fmt(-gap.missingGallons)} gal overlap`}</span>).
      </p>
      {annotation && (annotation.reason || annotation.note) && !open && (
        <p className="text-sm text-muted-foreground">
          {annotation.reason ? GAP_REASONS.find((r) => r.value === annotation.reason)?.label : ''}
          {annotation.reason && annotation.note ? ': ' : ''}
          {annotation.note}
        </p>
      )}
      {open ? (
        <div className="space-y-2">
          <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value as GapReason | '')} className="h-8 rounded border border-border bg-background px-2 text-sm">
            <option value="">Reason</option>
            {GAP_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <Input aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={save.isPending} onClick={() => submit(resolved)}>Save note</Button>
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => submit(true)}>Save and resolve</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {save.isError && <ErrorMessage>{(save.error as Error).message}</ErrorMessage>}
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{annotation ? 'Edit note' : 'Add note'}</Button>
          {resolved && <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => submit(false)}>Reopen</Button>}
        </div>
      )}
    </li>
  )
}

/** Gaps in a fuel truck's meter chain (readings from scans and from the Fuel sheet), with notes and resolve. Nothing for a truck with no readings. */
export function MeterGaps({ equipmentId }: { equipmentId: number }) {
  const { data, isError, error } = useTruckMeterGaps(equipmentId)
  const { data: annotations = [] } = useGapAnnotations(equipmentId)
  const [showResolved, setShowResolved] = useState(false)

  if (isError) return <ErrorMessage>{(error as Error).message}</ErrorMessage>
  if (!data || (data.lastEnd.front == null && data.lastEnd.rear == null)) return null

  const byGap = new Map(annotations.map((a) => [annotationGapId(a), a]))
  const open = data.gaps.filter((g) => !byGap.get(g.id)?.resolved)
  const resolved = data.gaps.filter((g) => byGap.get(g.id)?.resolved)
  const shown = showResolved ? [...open, ...resolved].sort((a, b) => b.sheetDate.localeCompare(a.sheetDate)) : [...open].sort((a, b) => b.sheetDate.localeCompare(a.sheetDate))

  return (
    <section className="space-y-3" data-testid="meter-gaps-section">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Meter gaps {open.length > 0 && <Badge variant="destructive" data-testid="meter-gap-count">{open.length}</Badge>}
        </h2>
        {resolved.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </Button>
        )}
      </div>
      <Card className="px-4">
        <p className="py-3 text-sm text-muted-foreground" data-testid="meter-last-ends">
          Last recorded: front <span className="font-mono">{data.lastEnd.front == null ? '—' : fmt(data.lastEnd.front)}</span>, rear{' '}
          <span className="font-mono">{data.lastEnd.rear == null ? '—' : fmt(data.lastEnd.rear)}</span>. Each reading should start where the one before it ended.
        </p>
        {shown.length === 0 ? (
          <p className="border-t border-border py-3 text-sm">No open gaps.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((g) => <GapRow key={g.id} gap={g} annotation={byGap.get(g.id)} equipmentId={equipmentId} />)}
          </ul>
        )}
      </Card>
    </section>
  )
}
