'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  AIRCRAFT_FUEL_TYPES,
  DEFAULT_DENSITY,
  findFuelType,
  planWingLoad,
  SHEET_TOLERANCE_GAL,
  truckCheck,
  type TankLbs
} from '@/lib/wing-loading'
import { Calculator } from 'lucide-react'
import { useMemo, useState } from 'react'

interface WingLoadingPanelProps {
  /** Aircraft type as QT or the board gives it ("737", "B739M", "E75"). */
  aircraftType?: string
  /** Planned gate fuel from QT, lbs: what the aircraft should hold after fueling (the "Req" on the ticket). */
  plannedLbs: number
  /** Shown in the dialog title, e.g. "UA1026 N17448". */
  title?: string
}

const num = (value: string): number | undefined => {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
const fmt = (n: number) => Math.round(n).toLocaleString()

// The airline's routine fuel service form, worked out for the fueler: type in what each tank holds on
// arrival and every line to write on the sheet is filled in. Nothing is stored.
export function WingLoadingPanel({ aircraftType, plannedLbs, title }: WingLoadingPanelProps) {
  const detected = findFuelType(aircraftType)
  const [typeKey, setTypeKey] = useState(detected?.key ?? '')
  const [open, setOpen] = useState(false)
  const [before, setBefore] = useState<Record<keyof TankLbs, string>>({ left: '', center: '', right: '' })
  const [density, setDensity] = useState(String(DEFAULT_DENSITY))
  const [wingMax, setWingMax] = useState('')
  const [truck, setTruck] = useState('')

  const fuelType = AIRCRAFT_FUEL_TYPES.find((t) => t.key === typeKey) ?? detected
  // Nov-Mar uses the placard's winter wing figure.
  const winter = [10, 11, 0, 1, 2].includes(new Date().getMonth())

  const result = useMemo(
    () =>
      fuelType
        ? planWingLoad({
            capacity: fuelType,
            plannedLbs,
            winter,
            density: num(density),
            wingMaxLbs: num(wingMax),
            before: { left: num(before.left), center: num(before.center), right: num(before.right) }
          })
        : null,
    [fuelType, plannedLbs, winter, density, wingMax, before]
  )

  if (!fuelType || !result) return null

  const tanks: { key: keyof TankLbs; label: string }[] = [
    { key: 'left', label: 'L Wing' },
    ...(result.hasCenter ? [{ key: 'center' as const, label: 'Center' }] : []),
    { key: 'right', label: 'R Wing' }
  ]
  const calcGallons = result.totalAddGallons
  const truckGallons = num(truck)
  const check = truckGallons === undefined ? null : truckCheck(calcGallons, truckGallons)
  const row = 'flex items-baseline justify-between gap-3 py-1'

  return (
    <div data-testid="wing-loading" className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs">
      <span className="min-w-0 font-medium text-foreground">
        Wing loading
        <span className="ml-2 font-mono text-muted-foreground">
          {tanks.map((t) => `${t.label[0]} ${fmt(result.after[t.key])}`).join(' · ')} lbs
        </span>
      </span>
      <Button type="button" variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setOpen(true)}>
        <Calculator className="mr-1 h-3 w-3" />
        Fuel sheet
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto text-sm">
          <DialogHeader>
            <DialogTitle>Fuel sheet{title ? `: ${title}` : ''}</DialogTitle>
            <DialogDescription>
              Type what each tank holds on arrival; write the bold numbers on the airline sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <select
              aria-label="Aircraft fuel type"
              value={fuelType.key}
              onChange={(e) => setTypeKey(e.target.value)}
              className="h-7 rounded border border-border bg-background px-1"
            >
              {AIRCRAFT_FUEL_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              Wing max
              <Input
                inputMode="numeric"
                placeholder={String(winter && fuelType.wingWinterLbs ? fuelType.wingWinterLbs : fuelType.wingLbs)}
                value={wingMax}
                onChange={(e) => setWingMax(e.target.value)}
                className="h-7 w-20 px-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              lbs/gal
              <Input
                inputMode="decimal"
                value={density}
                onChange={(e) => setDensity(e.target.value)}
                className="h-7 w-16 px-1 text-xs"
              />
            </label>
          </div>

          <table className="w-full text-right font-mono">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left font-normal">Tank</th>
                <th className="font-normal">Before</th>
                <th className="font-normal">Desired</th>
                <th className="font-normal">Add (lbs)</th>
              </tr>
            </thead>
            <tbody>
              {tanks.map((t) => (
                <tr key={t.key}>
                  <td className="py-0.5 text-left font-sans">{t.label}</td>
                  <td>
                    <Input
                      aria-label={`${t.label} before, lbs`}
                      inputMode="numeric"
                      placeholder="0"
                      value={before[t.key]}
                      onChange={(e) => setBefore({ ...before, [t.key]: e.target.value })}
                      className="ml-auto h-7 w-20 px-1 text-right text-xs"
                    />
                  </td>
                  <td className="font-bold">{fmt(result.after[t.key])}</td>
                  <td>{fmt(result.add[t.key])}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-1 text-left font-sans">Total</td>
                <td>{fmt(result.beforeTotalLbs)}</td>
                <td className="font-bold">{fmt(result.totalAfterLbs)}</td>
                <td>{fmt(result.totalAddLbs)}</td>
              </tr>
            </tbody>
          </table>

          <div className="divide-y divide-border rounded-md border border-border px-3 font-mono">
            <div className={row}>
              <span className="font-sans">Planned gate fuel</span>
              <b>{fmt(result.plannedLbs)}</b>
            </div>
            <div className={row}>
              <span className="font-sans">Subtract before fuel total</span>
              <b>{fmt(result.beforeTotalLbs)}</b>
            </div>
            <div className={row}>
              <span className="font-sans">Equals pounds to add</span>
              <b>{fmt(result.totalAddLbs)}</b>
            </div>
            <div className={row}>
              <span className="font-sans">Divided by density</span>
              <b>{result.density}</b>
            </div>
            <div className={row}>
              <span className="font-sans">Calculated gallons to add</span>
              <b>{fmt(calcGallons)}</b>
            </div>
            <div className={row}>
              <span className="font-sans">Subtract total gallons added (truck meter)</span>
              <Input
                aria-label="Gallons added by the truck"
                inputMode="numeric"
                placeholder="gal"
                value={truck}
                onChange={(e) => setTruck(e.target.value)}
                className="h-7 w-20 px-1 text-right text-xs"
              />
            </div>
            <div className={row}>
              <span className="font-sans">Equals (tolerance +{SHEET_TOLERANCE_GAL} / -{SHEET_TOLERANCE_GAL})</span>
              {check ? (
                <b className={check.withinTolerance ? 'text-success' : 'text-destructive'}>
                  {check.difference} {check.withinTolerance ? 'OK' : 'out of tolerance'}
                </b>
              ) : (
                <span className="text-muted-foreground">enter truck gallons</span>
              )}
            </div>
          </div>

          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-destructive">
              {w}
            </p>
          ))}
          {!fuelType.verified && (
            <p className="text-xs text-muted-foreground">
              Capacities for this type are not yet confirmed from a fuel sheet; check the wing max.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
