'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { useFilterChanges } from '@/hooks/use-equipment-log'
import { FILTER_LIFE_DAYS, filterState } from '@/lib/equipment-log'
import { instantToWallClock, wallClockToInstant } from '@/lib/equipment-maintenance'
import { formatLocalDate, formatLocalTime } from '@/lib/local-date'
import { ErrorMessage } from '@/messages/error-message'

/** When the filters of a fuel truck were last changed, and the log of changes (replace at least yearly, sooner on high DPI). */
export function FilterChanges({ equipmentId }: { equipmentId: number }) {
  const { changes, loading, error, create, remove } = useFilterChanges(equipmentId)
  const { user } = useCurrentUser()
  const { fboZone, suffixAt } = useDisplayZone()
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [what, setWhat] = useState('')
  const [dpi, setDpi] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const last = changes[0] ?? null
  const { state, days } = filterState(last?.changed_at ?? null)

  const stamp = (iso: string) => {
    const d = new Date(iso)
    return `${formatLocalDate(d, fboZone)} ${formatLocalTime(d, fboZone)} ${suffixAt(iso)}`
  }

  function start() {
    setFormError(null)
    setWhat('')
    setDpi('')
    setNotes('')
    setWhen(instantToWallClock(new Date().toISOString(), fboZone))
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const d = dpi.trim() === '' ? null : Number(dpi)
    if (d !== null && !(d >= 0)) return setFormError('DPI must be a number, 0 or more.')
    if (!when) return setFormError('Enter the date and time.')
    try {
      await create({ equipment_id: equipmentId, changed_at: wallClockToInstant(when, fboZone), filter_description: what.trim(), dpi_at_change: d, notes: notes.trim(), changed_by: user?.id ?? null })
      setOpen(false)
    } catch (err) {
      setFormError((err as Error).message)
    }
  }

  return (
    <section className="space-y-3" data-testid="filter-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Filters{' '}
          {state === 'overdue' && <Badge variant="destructive" className="ml-1 align-middle">Replace now</Badge>}
          {state === 'due_soon' && <Badge variant="outline" className="ml-1 align-middle">Due soon</Badge>}
        </h2>
        {!open && (
          <Button size="sm" onClick={start} data-testid="add-filter-change">
            Log filter change
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground" data-testid="filter-age">
        {last ? `Last changed ${stamp(last.changed_at)} (${days} days ago, replace within ${FILTER_LIFE_DAYS} days or sooner if DPI climbs).` : 'No filter change logged yet.'}
      </p>

      {open && (
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3" data-testid="filter-form">
            <div className="space-y-1">
              <Label htmlFor="fc-when">Changed at ({suffixAt()})</Label>
              <Input id="fc-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fc-what">Filters (part, how many)</Label>
              <Input id="fc-what" value={what} onChange={(e) => setWhat(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fc-dpi">DPI before the change (psi, optional)</Label>
              <Input id="fc-dpi" inputMode="decimal" value={dpi} onChange={(e) => setDpi(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fc-notes">Notes (optional)</Label>
              <Input id="fc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" data-testid="filter-save">Save</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorMessage>{(error as Error).message}</ErrorMessage>}
      {!loading && changes.length > 0 && (
        <ul className="space-y-1">
          {changes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-sm" data-testid="filter-row">
              <div className="min-w-0">
                <span className="text-muted-foreground">{stamp(c.changed_at)}</span>
                {c.filter_description && <span className="ml-3">{c.filter_description}</span>}
                {c.dpi_at_change != null && <span className="ml-3 font-mono">DPI {c.dpi_at_change}</span>}
                {c.notes && <span className="ml-3 text-muted-foreground break-words">{c.notes}</span>}
              </div>
              <Button size="icon" variant="ghost" aria-label="Delete filter change" onClick={() => confirm('Delete this filter change?') && remove(c.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
