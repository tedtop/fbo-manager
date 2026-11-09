'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { useNotes } from '@/hooks/use-equipment-log'
import { instantToWallClock, wallClockToInstant } from '@/lib/equipment-maintenance'
import { formatLocalDate, formatLocalTime } from '@/lib/local-date'
import { ErrorMessage } from '@/messages/error-message'

/** General notes about a piece of equipment, newest first. Anyone can add one; the time defaults to now and can be backdated. */
export function EquipmentNotes({ equipmentId }: { equipmentId: number }) {
  const { notes, loading, error, create, remove } = useNotes(equipmentId)
  const { user } = useCurrentUser()
  const { fboZone, suffixAt } = useDisplayZone()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [when, setWhen] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function start() {
    setFormError(null)
    setBody('')
    setWhen(instantToWallClock(new Date().toISOString(), fboZone))
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return setFormError('Write the note.')
    if (!when) return setFormError('Enter the date and time.')
    try {
      await create({ equipment_id: equipmentId, body: body.trim(), noted_at: wallClockToInstant(when, fboZone), noted_by: user?.id ?? null })
      setOpen(false)
    } catch (err) {
      setFormError((err as Error).message)
    }
  }

  return (
    <section className="space-y-3" data-testid="notes-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notes</h2>
        {!open && (
          <Button size="sm" onClick={start} data-testid="add-note">
            Add note
          </Button>
        )}
      </div>

      {open && (
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3" data-testid="note-form">
            <div className="space-y-1">
              <Label htmlFor="n-body">Note</Label>
              <Textarea id="n-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Noticed the battery was dead at 2am" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="n-when">When ({suffixAt()})</Label>
              <Input id="n-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" data-testid="note-save">Save</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorMessage>{(error as Error).message}</ErrorMessage>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const d = new Date(n.noted_at)
            return (
              <li key={n.id}>
                <Card className="p-3 flex items-start justify-between gap-2" data-testid="note-row">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {formatLocalDate(d, fboZone)} {formatLocalTime(d, fboZone)} {suffixAt(n.noted_at)}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Delete note" onClick={() => confirm('Delete this note?') && remove(n.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
