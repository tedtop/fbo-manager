'use client'

import { useState } from 'react'
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { useMaintenanceItems } from '@/hooks/use-equipment-maintenance'
import { instantToWallClock, sortMaintenanceItems, wallClockToInstant } from '@/lib/equipment-maintenance'
import { formatLocalDate, formatLocalTime } from '@/lib/local-date'
import type { MaintenanceItemRow } from '@/repositories/equipment-maintenance.repo'
import { ErrorMessage } from '@/messages/error-message'

type Mode = { kind: 'add' } | { kind: 'edit'; item: MaintenanceItemRow } | { kind: 'resolve'; item: MaintenanceItemRow } | null

/** Maintenance items of one piece of equipment: open first, add / edit / resolve / reopen / delete. Times are FBO-zone wall clock. */
export function MaintenanceItems({ equipmentId, onAllResolved }: { equipmentId: number; onAllResolved?: () => void }) {
  const { items, loading, error, create, update, resolve, reopen, remove } = useMaintenanceItems(equipmentId)
  const { user } = useCurrentUser()
  const { fboZone, suffixAt } = useDisplayZone()
  const [mode, setMode] = useState<Mode>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const sorted = sortMaintenanceItems(items)
  const openCount = sorted.filter((i) => i.status === 'open').length

  const stamp = (iso: string) => {
    const d = new Date(iso)
    return `${formatLocalDate(d, fboZone)} ${formatLocalTime(d, fboZone)} ${suffixAt(iso)}`
  }

  function start(next: Mode) {
    setFormError(null)
    setMode(next)
    if (next?.kind === 'add') {
      setTitle('')
      setNotes('')
      setWhen(instantToWallClock(new Date().toISOString(), fboZone))
    } else if (next?.kind === 'edit') {
      setTitle(next.item.title)
      setNotes(next.item.description)
      setWhen(instantToWallClock(next.item.noted_at, fboZone))
    } else if (next?.kind === 'resolve') {
      setNotes('')
      setWhen(instantToWallClock(new Date().toISOString(), fboZone))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return
    setFormError(null)
    try {
      if (mode.kind !== 'resolve' && !title.trim()) {
        setFormError('Enter a short title.')
        return
      }
      if (!when) {
        setFormError('Enter the date and time.')
        return
      }
      const instant = wallClockToInstant(when, fboZone)
      if (mode.kind === 'add') {
        await create({ equipment_id: equipmentId, title: title.trim(), description: notes.trim(), noted_at: instant, noted_by: user?.id ?? null })
      } else if (mode.kind === 'edit') {
        await update({ id: mode.item.id, updates: { title: title.trim(), description: notes.trim(), noted_at: instant } })
      } else {
        await resolve({ id: mode.item.id, resolutionNotes: notes.trim(), resolvedAt: instant, resolvedBy: user?.id ?? null })
        if (openCount === 1) onAllResolved?.()
      }
      setMode(null)
    } catch (err) {
      setFormError((err as Error).message)
    }
  }

  const formTitle = mode?.kind === 'add' ? 'Add item' : mode?.kind === 'edit' ? 'Edit item' : `Resolve: ${mode?.kind === 'resolve' ? mode.item.title : ''}`

  return (
    <section className="space-y-3" data-testid="maintenance-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Maintenance items{' '}
          {openCount > 0 && <Badge variant="outline" className="ml-1 align-middle">{openCount} open</Badge>}
        </h2>
        {mode === null && (
          <Button size="sm" onClick={() => start({ kind: 'add' })} data-testid="add-maintenance-item">
            Add item
          </Button>
        )}
      </div>

      {mode && (
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3" data-testid="maintenance-form">
            <div className="font-medium">{formTitle}</div>
            {mode.kind !== 'resolve' && (
              <div className="space-y-1">
                <Label htmlFor="mi-title">Title</Label>
                <Input id="mi-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dead battery" maxLength={120} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="mi-when">
                {mode.kind === 'resolve' ? 'Resolved at' : 'Noted at'} ({suffixAt()})
              </Label>
              <Input id="mi-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mi-notes">{mode.kind === 'resolve' ? 'Resolution notes (optional)' : 'Notes'}</Label>
              <Textarea id="mi-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" data-testid="maintenance-save">
                {mode.kind === 'resolve' ? 'Resolve' : 'Save'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setMode(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorMessage>{(error as Error).message}</ErrorMessage>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No maintenance items logged.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => (
            <li key={item.id}>
              <Card className="p-3 space-y-1" data-testid={`maintenance-item-${item.status}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium break-words">{item.title}</div>
                    <div className="text-xs text-muted-foreground">Noted {stamp(item.noted_at)}</div>
                  </div>
                  <Badge variant={item.status === 'open' ? 'default' : 'secondary'} className="shrink-0">
                    {item.status === 'open' ? 'Open' : 'Resolved'}
                  </Badge>
                </div>
                {item.description && <p className="text-sm whitespace-pre-wrap break-words">{item.description}</p>}
                {item.status === 'resolved' && item.resolved_at && (
                  <p className="text-xs text-muted-foreground">
                    Resolved {stamp(item.resolved_at)}
                    {item.resolution_notes ? `: ${item.resolution_notes}` : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {item.status === 'open' ? (
                    <Button size="sm" variant="outline" onClick={() => start({ kind: 'resolve', item })}>
                      <Check className="w-4 h-4 mr-1" /> Resolve
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => reopen(item.id)}>
                      <RotateCcw className="w-4 h-4 mr-1" /> Reopen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => start({ kind: 'edit', item })}>
                    <Pencil className="w-4 h-4 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${item.title}"?`)) remove(item.id)
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
