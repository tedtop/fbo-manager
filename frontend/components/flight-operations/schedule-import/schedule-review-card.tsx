'use client'

import { Link2, Link2Off, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { TimeInput } from '@/components/ui/time-input'
import { cn } from '@/lib/utils'
import { REVIEW_REASON_LABELS, type DuplicateSuggestion } from '@/lib/schedule-import/types'
import type { ReviewEvaluation, ScheduleReviewItem, TailTypeLookup, WallTime } from '@/lib/schedule-import/review'

interface ServiceOption {
  key: string
  label: string
}

interface ScheduleReviewCardProps {
  item: ScheduleReviewItem
  evaluation: ReviewEvaluation
  lookup: TailTypeLookup | undefined
  services: ServiceOption[]
  disabled?: boolean
  onChange: (patch: Partial<ScheduleReviewItem>) => void
  onUnpair: () => void
}

const fieldLabel = 'text-xs font-medium text-muted-foreground'

function localLabel(iso: string | null): string {
  return iso ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : 'none'
}

function WhenEditor({ label, testId, value, onChange }: { label: string; testId: string; value: WallTime; onChange: (v: WallTime) => void }) {
  return (
    <fieldset className="space-y-1">
      <legend className={fieldLabel}>{label}</legend>
      <div className="flex gap-2">
        <Input
          type="date"
          aria-label={`${label} date`}
          data-testid={`${testId}-date`}
          value={value.date}
          className="h-10 flex-1 min-w-0"
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
        <TimeInput
          aria-label={`${label} time`}
          data-testid={`${testId}-time`}
          value={value.time}
          className="h-10 w-24"
          onChange={(time) => onChange({ ...value, time })}
        />
      </div>
    </fieldset>
  )
}

export function ScheduleReviewCard({ item, evaluation: ev, lookup, services, disabled, onChange, onUnpair }: ScheduleReviewCardProps) {
  const paired = item.sourceRows.length > 1
  const dup = ev.dup
  const hasMatch = dup.match !== null
  const action: DuplicateSuggestion = ev.plan === 'skip' && !ev.include ? 'skip' : ev.plan
  const lookingUp = lookup?.state === 'pending' && !item.typeOverride?.trim()
  const selectedServices = item.services
  const addable = services.filter((s) => !selectedServices.includes(s.key))
  const labelOf = (key: string) => services.find((s) => s.key === key)?.label ?? key

  return (
    <article
      data-testid="schedule-review-card"
      data-tail={item.tail}
      data-plan={ev.plan}
      className={cn('rounded-xl border bg-card p-3 sm:p-4 space-y-3', ev.plan === 'skip' ? 'border-border opacity-80' : 'border-primary/40')}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Checkbox
          aria-label={`Include ${item.tail || 'flight'}`}
          data-testid="include-checkbox"
          className="size-6 sm:size-5"
          checked={ev.include}
          disabled={disabled || !ev.importable}
          onCheckedChange={(v) => onChange({ includeOverride: v === true, ...(v === true && action === 'skip' && hasMatch ? { actionOverride: 'add' } : {}) })}
        />
        <Input
          aria-label="Tail number"
          data-testid="tail-input"
          value={item.tail}
          disabled={disabled}
          className="h-10 w-32 font-mono uppercase"
          onChange={(e) => onChange({ tail: e.target.value.toUpperCase() })}
        />
        {ev.isQuickTurn && <Badge>Quick turn</Badge>}
        <Badge variant="outline">
          {ev.direction === 'both' ? 'Arrival + departure' : ev.direction === 'arrival_only' ? 'Arrival only' : ev.direction === 'departure_only' ? 'Departure only' : 'No time'}
        </Badge>
        {paired && (
          <>
            <Badge variant="secondary" data-testid="paired-badge" className="gap-1">
              <Link2 className="h-3 w-3" /> Paired from 2 rows
            </Badge>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={disabled} onClick={onUnpair}>
              <Link2Off className="mr-1 h-3.5 w-3.5" /> Unpair
            </Button>
          </>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <WhenEditor label="Arrival" testId="arrival" value={item.arrival} onChange={(arrival) => onChange({ arrival })} />
        <WhenEditor label="Departure" testId="departure" value={item.departure} onChange={(departure) => onChange({ departure })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={fieldLabel} htmlFor={`${item.id}-type`}>
            Aircraft type (from the tail number)
          </label>
          <Input
            id={`${item.id}-type`}
            data-testid="type-input"
            value={item.typeOverride ?? ''}
            disabled={disabled}
            placeholder={ev.typeSource === 'registry' ? ev.typeDisplay : 'Type, e.g. GLF4 or Citation CJ2'}
            className="h-10"
            onChange={(e) => onChange({ typeOverride: e.target.value || null })}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="type-status">
            {lookingUp && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Looking up {item.tail}…
              </span>
            )}
            {!lookingUp && ev.typeSource === 'registry' && <span>Registry: {ev.typeDisplay}</span>}
            {!lookingUp && ev.typeSource === 'override' && <span>Using your entry: {ev.typeDisplay}</span>}
            {!lookingUp && ev.typeSource === 'none' && <span>No registry match: type left empty</span>}
            {item.typePrinted && item.typeOverride !== item.typePrinted && (
              <button
                type="button"
                className="underline underline-offset-2"
                disabled={disabled}
                data-testid="use-printed-type"
                onClick={() => onChange({ typeOverride: item.typePrinted })}
              >
                Use “{item.typePrinted}” (as printed)
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <label className={fieldLabel} htmlFor={`${item.id}-customer`}>
            Customer
          </label>
          <Input
            id={`${item.id}-customer`}
            data-testid="customer-input"
            value={item.customer}
            disabled={disabled}
            className="h-10"
            onChange={(e) => onChange({ customer: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className={fieldLabel}>Services</div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedServices.map((key) => (
            <button
              key={key}
              type="button"
              data-testid="service-chip"
              data-service-key={key}
              disabled={disabled}
              aria-label={`Remove ${labelOf(key)}`}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs text-primary-foreground"
              onClick={() => onChange({ services: selectedServices.filter((k) => k !== key) })}
            >
              {labelOf(key)} <span aria-hidden>×</span>
            </button>
          ))}
          {selectedServices.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
          {addable.length > 0 && (
            <select
              aria-label="Add a service"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value=""
              disabled={disabled}
              onChange={(e) => e.target.value && onChange({ services: [...selectedServices, e.target.value] })}
            >
              <option value="">Add service…</option>
              {addable.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className={fieldLabel} htmlFor={`${item.id}-notes`}>
          Notes
        </label>
        <Input
          id={`${item.id}-notes`}
          data-testid="notes-input"
          value={item.notes}
          disabled={disabled}
          className="h-10"
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>

      {ev.reasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="review-reasons">
          {ev.reasons.map((r) => (
            <Badge key={r} variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 whitespace-normal">
              {REVIEW_REASON_LABELS[r]}
            </Badge>
          ))}
          <Button
            type="button"
            size="sm"
            variant={item.acknowledged ? 'secondary' : 'outline'}
            className="h-8"
            disabled={disabled}
            aria-pressed={item.acknowledged}
            data-testid="acknowledge"
            onClick={() => onChange({ acknowledged: !item.acknowledged })}
          >
            {item.acknowledged ? 'Checked' : 'I checked this'}
          </Button>
        </div>
      )}
      {!ev.importable && <p className="text-sm text-destructive">This row cannot be imported until it has a tail number and at least one time.</p>}

      {hasMatch && dup.match && (
        <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm" data-testid="duplicate-box">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-testid="duplicate-badge">
              {ev.matchIsSheetRow ? 'Same flight as an earlier row on this sheet' : 'Already on the board'}
            </Badge>
            {!ev.matchIsSheetRow && (
              <span className="text-xs text-muted-foreground">
                {dup.match.tail_number} arr {localLabel(dup.match.scheduled_arrival_time)} / dep {localLabel(dup.match.scheduled_departure_time)}
              </span>
            )}
          </div>
          {dup.fills.length > 0 && !ev.matchIsSheetRow && (
            <div className="text-xs">Would fill in: {dup.fills.map((f) => f.field.replace('scheduled_', '').replace('_time', '').replace('_', ' ')).join(', ')}</div>
          )}
          {dup.conflicts.length > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-400">
              Board differs (kept as is):{' '}
              {dup.conflicts
                .map((c) => `${c.field.replace('scheduled_', '').replace('_time', '').replace('_', ' ')} board ${Array.isArray(c.existing) ? c.existing.join(',') : (c.field.includes('time') ? localLabel(c.existing as string | null) : c.existing)}, sheet ${c.field.includes('time') ? localLabel(c.incoming as string) : c.incoming}`)
                .join('; ')}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className={fieldLabel} htmlFor={`${item.id}-action`}>
              What to do
            </label>
            <select
              id={`${item.id}-action`}
              data-testid="duplicate-action"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={ev.include ? ev.plan : 'skip'}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value as DuplicateSuggestion
                onChange({ actionOverride: next, includeOverride: next !== 'skip' })
              }}
            >
              <option value="skip">Skip (already there)</option>
              {!ev.matchIsSheetRow && <option value="update">Update (fill empty fields only)</option>}
              <option value="add">Add as a new flight</option>
            </select>
          </div>
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Printed row{paired ? 's' : ''}{item.typePrinted ? ` (type as printed: ${item.typePrinted})` : ''}</summary>
        <ul className="mt-1 space-y-1 font-mono break-words" data-testid="source-rows">
          {item.sourceRows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list of printed rows
            <li key={i}>{r.raw_row_text || '(no text)'}</li>
          ))}
        </ul>
      </details>
    </article>
  )
}
