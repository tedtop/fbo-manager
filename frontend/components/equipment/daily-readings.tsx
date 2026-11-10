'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { useReadings } from '@/hooks/use-equipment-log'
import { DPI_REPLACE_AT, daysUntilDpiLimit, dpiTrendPerDay } from '@/lib/equipment-log'
import { instantToWallClock, wallClockToInstant } from '@/lib/equipment-maintenance'
import { formatLocalDate, formatLocalTime } from '@/lib/local-date'
import type { ReadingRow } from '@/repositories/equipment-log.repo'
import { ErrorMessage } from '@/messages/error-message'

const fmt = (n: number | null) => (n == null ? '—' : String(n))

/** Small line chart of one series, oldest to newest, scaled to its own range. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const w = 160
  const h = 36
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="text-primary">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** Daily differential-pressure (DPI) and nozzle pressure (PSI) log of a fuel truck, with the DPI trend. */
export function DailyReadings({ equipmentId }: { equipmentId: number }) {
  const { readings, loading, error, create, remove } = useReadings(equipmentId)
  const { user } = useCurrentUser()
  const { fboZone, suffixAt } = useDisplayZone()
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [dpi, setDpi] = useState('')
  const [nozzle, setNozzle] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const stamp = (r: ReadingRow) => {
    const d = new Date(r.read_at)
    return `${formatLocalDate(d, fboZone)} ${formatLocalTime(d, fboZone)} ${suffixAt(r.read_at)}`
  }

  function start() {
    setFormError(null)
    setDpi('')
    setNozzle('')
    setNotes('')
    setWhen(instantToWallClock(new Date().toISOString(), fboZone))
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const d = dpi.trim() === '' ? null : Number(dpi)
    const n = nozzle.trim() === '' ? null : Number(nozzle)
    if (d === null && n === null) return setFormError('Enter the DPI, the nozzle PSI, or both.')
    if ((d !== null && !(d >= 0)) || (n !== null && !(n >= 0))) return setFormError('Pressures must be numbers, 0 or more.')
    if (!when) return setFormError('Enter the date and time.')
    try {
      await create({ equipment_id: equipmentId, read_at: wallClockToInstant(when, fboZone), dpi_psi: d, nozzle_psi: n, notes: notes.trim(), read_by: user?.id ?? null })
      setOpen(false)
    } catch (err) {
      setFormError((err as Error).message)
    }
  }

  const recent = readings.slice(0, 30).reverse() // oldest to newest for the charts
  const trend = dpiTrendPerDay(readings)
  const daysLeft = daysUntilDpiLimit(readings)
  const dpiValues = recent.filter((r) => r.dpi_psi != null).map((r) => r.dpi_psi as number)
  const psiValues = recent.filter((r) => r.nozzle_psi != null).map((r) => r.nozzle_psi as number)

  return (
    <section className="space-y-3" data-testid="readings-log-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Daily readings</h2>
        {!open && (
          <Button size="sm" onClick={start} data-testid="add-reading">
            Log readings
          </Button>
        )}
      </div>

      {open && (
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3" data-testid="reading-form">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rd-dpi">Differential pressure, DPI (psi)</Label>
                <Input id="rd-dpi" inputMode="decimal" value={dpi} onChange={(e) => setDpi(e.target.value)} placeholder="5" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rd-psi">Nozzle pressure (psi)</Label>
                <Input id="rd-psi" inputMode="decimal" value={nozzle} onChange={(e) => setNozzle(e.target.value)} placeholder="32" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rd-when">Read at ({suffixAt()})</Label>
              <Input id="rd-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rd-notes">Note (optional)</Label>
              <Input id="rd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" data-testid="reading-save">Save</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorMessage>{(error as Error).message}</ErrorMessage>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : readings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No readings logged yet.</p>
      ) : (
        <>
          <Card className="p-3 space-y-2" data-testid="readings-trend">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">DPI (psi)</div>
                <div className="font-mono text-lg">{fmt(readings.find((r) => r.dpi_psi != null)?.dpi_psi ?? null)}</div>
                <Sparkline values={dpiValues} label="DPI trend" />
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Nozzle (psi)</div>
                <div className="font-mono text-lg">{fmt(readings.find((r) => r.nozzle_psi != null)?.nozzle_psi ?? null)}</div>
                <Sparkline values={psiValues} label="Nozzle pressure trend" />
              </div>
            </div>
            {trend != null && (
              <p className="text-xs text-muted-foreground">
                DPI {trend > 0 ? 'rising' : trend < 0 ? 'falling' : 'flat'} about {Math.abs(trend).toFixed(2)} psi per day
                {daysLeft != null && ` — projected to reach ${DPI_REPLACE_AT} psi in about ${daysLeft} days`}.
              </p>
            )}
          </Card>
          <ul className="space-y-1">
            {readings.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-sm" data-testid="reading-row">
                <div className="min-w-0">
                  <span className="text-muted-foreground">{stamp(r)}</span>
                  <span className="ml-3 font-mono">DPI {fmt(r.dpi_psi)}</span>
                  <span className="ml-3 font-mono">Nozzle {fmt(r.nozzle_psi)}</span>
                  {r.notes && <span className="ml-3 text-muted-foreground break-words">{r.notes}</span>}
                </div>
                <Button size="icon" variant="ghost" aria-label="Delete reading" onClick={() => confirm('Delete this reading?') && remove(r.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
