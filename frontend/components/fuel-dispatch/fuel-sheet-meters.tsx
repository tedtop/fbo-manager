'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFuelTrucks } from '@/hooks/use-fuel-trucks'
import { useSaveAirlineFueling, useSavedAirlineFueling, useTruckMeterGaps } from '@/hooks/use-meter-gaps'
import { formatLocalDate, formatLocalTime } from '@/lib/local-date'
import { pumpedGallons, startMismatch, type Register } from '@/lib/meter-gaps'
import { SHEET_TOLERANCE_GAL, truckCheck, type WingLoadResult } from '@/lib/wing-loading'
import { useEffect, useRef, useState } from 'react'

export interface FuelSheetMetersProps {
  result: WingLoadResult
  qtDispatchId?: string
  tailNumber?: string
  aircraftType?: string
  airline?: string
  /** Before-tank typed values, so a saved fueling can fill them back in. */
  onRestore?: (saved: { before: { left: string; center: string; right: string }; density: string }) => void
}

const LAST_TRUCK_KEY = 'fuel-sheet-truck'
const num = (v: string): number | undefined => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
const fmt = (n: number) => Math.round(n).toLocaleString()
const row = 'flex items-baseline justify-between gap-3 py-1'
const REGISTERS: { key: Register; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'rear', label: 'Rear' }
]

/**
 * The truck-meter half of the airline fuel sheet: truck, front/rear meter start and stop, the pumped-versus-calculated
 * check, a note when a start does not continue the truck's last end, and Save. Saving is never blocked by a gap.
 */
export function FuelSheetMeters({ result, qtDispatchId, tailNumber, aircraftType, airline, onRestore }: FuelSheetMetersProps) {
  const { trucks } = useFuelTrucks()
  const [truckId, setTruckId] = useState<number | undefined>(undefined)
  const [meters, setMeters] = useState<Record<Register, { start: string; stop: string }>>({
    front: { start: '', stop: '' },
    rear: { start: '', stop: '' }
  })
  const [manual, setManual] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const prefilled = useRef<number | undefined>(undefined)
  const restored = useRef(false)

  const saved = useSavedAirlineFueling(qtDispatchId, true)
  const chain = useTruckMeterGaps(truckId, saved.data?.id)
  const save = useSaveAirlineFueling()

  // Fill the form back in from a saved fueling, once.
  useEffect(() => {
    const tx = saved.data
    if (!tx || restored.current) return
    restored.current = true
    if (tx.fuel_truck_id) setTruckId(tx.fuel_truck_id)
    const next = { front: { start: '', stop: '' }, rear: { start: '', stop: '' } }
    for (const r of tx.readings) {
      if (r.meter) next[r.meter] = { start: String(r.meter_start ?? ''), stop: String(r.meter_end ?? '') }
    }
    setMeters(next)
    prefilled.current = tx.fuel_truck_id ?? undefined
    const s = (v: string | null) => (v == null ? '' : String(Number(v)))
    onRestore?.({
      before: { left: s(tx.tank_reading_before_left), center: s(tx.tank_reading_before_center), right: s(tx.tank_reading_before_right) },
      density: s(tx.density)
    })
  }, [saved.data, onRestore])

  // Pick the truck last used on this device, once the trucks are loaded.
  useEffect(() => {
    if (truckId !== undefined || saved.isLoading || saved.data || trucks.length === 0) return
    try {
      const last = Number(localStorage.getItem(LAST_TRUCK_KEY))
      if (trucks.some((t) => t.id === last)) setTruckId(last)
    } catch {
      /* storage can be blocked */
    }
  }, [trucks, truckId, saved.isLoading, saved.data])

  // Prefill each empty start with the truck's last recorded end.
  useEffect(() => {
    if (truckId === undefined || !chain.data || prefilled.current === truckId) return
    prefilled.current = truckId
    setMeters((m) => {
      const next = { ...m }
      for (const { key } of REGISTERS) {
        const last = chain.data.lastEnd[key]
        // Only the front register is prefilled: the rear is optional and often unused.
        if (last != null && key === 'front' && !m[key].start) next[key] = { ...m[key], start: String(last) }
      }
      return next
    })
  }, [truckId, chain.data])

  const truck = trucks.find((t) => t.id === truckId)
  const entries = REGISTERS.map(({ key, label }) => {
    const start = num(meters[key].start)
    const stop = num(meters[key].stop)
    const complete = start !== undefined && stop !== undefined
    const pumped = complete ? pumpedGallons(start, stop) : undefined
    return { key, label, start, stop, complete, pumped }
  })
  const invalid = entries.find((e) => e.complete && e.pumped === null)
  const filled = entries.filter((e) => e.complete && e.pumped)
  const metered = filled.length > 0 && !invalid
  const pumpedTotal = metered ? Math.round(filled.reduce((s, e) => s + (e.pumped?.gallons ?? 0), 0) * 10) / 10 : undefined
  const truckGallons = pumpedTotal ?? num(manual)
  const check = truckGallons === undefined ? null : truckCheck(result.totalAddGallons, truckGallons)
  const canSave = !!qtDispatchId && !!truck && metered && !save.isPending

  const onSave = async () => {
    if (!qtDispatchId || !truck || !metered) return
    const now = new Date()
    const registers: Partial<Record<Register, { start: number; stop: number }>> = {}
    for (const e of filled) registers[e.key] = { start: e.start as number, stop: e.stop as number }
    try {
      await save.mutateAsync({
        qtDispatchId, truckId: truck.id, truckNumber: truck.equipment_id,
        date: formatLocalDate(now), time: formatLocalTime(now),
        tailNumber: tailNumber ?? '', aircraftType, airline,
        plannedLbs: result.plannedLbs, calculatedGallons: result.totalAddGallons, density: result.density,
        before: { left: result.before.left, center: result.hasCenter ? result.before.center : null, right: result.before.right },
        after: { left: result.after.left, center: result.hasCenter ? result.after.center : null, right: result.after.right },
        registers
      })
      try { localStorage.setItem(LAST_TRUCK_KEY, String(truck.id)) } catch { /* ignore */ }
      setMessage({ ok: true, text: 'Saved to the truck.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' })
    }
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border px-3 font-mono" data-testid="fuel-sheet-meters">
      <div className={row}>
        <span className="font-sans">Fuel truck</span>
        <select
          aria-label="Fuel truck"
          value={truckId ?? ''}
          onChange={(e) => {
            setTruckId(e.target.value ? Number(e.target.value) : undefined)
            setMessage(null)
          }}
          className="h-7 max-w-[11rem] rounded border border-border bg-background px-1 font-sans text-xs"
        >
          <option value="">Choose a truck</option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.equipment_id} {t.equipment_name}
            </option>
          ))}
        </select>
      </div>
      {entries.map((e) => {
        const mismatch = chain.data && truck ? startMismatch(chain.data.lastEnd[e.key], e.start) : null
        return (
          <div key={e.key} className="py-1">
            <div className={row}>
              <span className="font-sans">{e.label} meter start / stop</span>
              <span className="flex gap-1">
                <Input aria-label={`${e.label} meter start`} inputMode="decimal" placeholder="start" value={meters[e.key].start}
                  onChange={(ev) => setMeters({ ...meters, [e.key]: { ...meters[e.key], start: ev.target.value } })} className="h-7 w-24 px-1 text-right text-xs" />
                <Input aria-label={`${e.label} meter stop`} inputMode="decimal" placeholder="stop" value={meters[e.key].stop}
                  onChange={(ev) => setMeters({ ...meters, [e.key]: { ...meters[e.key], stop: ev.target.value } })} className="h-7 w-24 px-1 text-right text-xs" />
              </span>
            </div>
            {e.pumped?.rolledOver && <p className="font-sans text-xs text-muted-foreground">Meter rolled over: {e.pumped.gallons} gal.</p>}
            {e.pumped === null && <p className="font-sans text-xs text-destructive">Stop is below start: check the numbers.</p>}
            {mismatch && (
              <p className="font-sans text-xs text-amber-600 dark:text-amber-400" data-testid="meter-start-mismatch">
                Truck {truck?.equipment_id} {e.label.toLowerCase()} meter last ended at {mismatch.lastEnd.toLocaleString()}.{' '}
                {mismatch.missingGallons > 0
                  ? `${mismatch.missingGallons.toLocaleString()} gal not recorded in between.`
                  : `This starts ${Math.abs(mismatch.missingGallons).toLocaleString()} gal below it.`}{' '}
                You can still save; the gap is flagged for review.
              </p>
            )}
          </div>
        )
      })}
      <div className={row}>
        <span className="font-sans">Subtract total gallons added (truck meter)</span>
        {pumpedTotal !== undefined ? (
          <b data-testid="meter-pumped">{fmt(pumpedTotal)}</b>
        ) : (
          <Input aria-label="Gallons added by the truck" inputMode="numeric" placeholder="gal" value={manual}
            onChange={(ev) => setManual(ev.target.value)} className="h-7 w-20 px-1 text-right text-xs" />
        )}
      </div>
      <div className={row}>
        <span className="font-sans">Equals (tolerance +{SHEET_TOLERANCE_GAL} / -{SHEET_TOLERANCE_GAL})</span>
        {check ? (
          <b className={check.withinTolerance ? 'text-success' : 'text-destructive'}>
            {check.difference} {check.withinTolerance ? 'OK' : 'out of tolerance'}
          </b>
        ) : (
          <span className="text-muted-foreground">enter the meter numbers</span>
        )}
      </div>
      {qtDispatchId && (
        <div className="flex items-center justify-between gap-3 py-2 font-sans">
          <span className={`text-xs ${message?.ok === false ? 'text-destructive' : 'text-muted-foreground'}`} role="status">
            {message?.text ?? (saved.data ? 'Saved earlier; saving again updates it.' : 'Saving records the fueling on the truck.')}
          </span>
          <Button type="button" size="sm" className="h-7 shrink-0 px-3 text-xs" disabled={!canSave} onClick={onSave}>
            {save.isPending ? 'Saving…' : saved.data ? 'Update' : 'Save fueling'}
          </Button>
        </div>
      )}
    </div>
  )
}
