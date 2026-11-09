'use client'

import { Input } from '@/components/ui/input'
import {
  AIRCRAFT_FUEL_TYPES,
  DEFAULT_DENSITY,
  findFuelType,
  planWingLoad,
  type TankLbs
} from '@/lib/wing-loading'
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'

interface WingLoadingPanelProps {
  /** Aircraft type as QT or the board gives it ("737", "B739M", "E75"). */
  aircraftType?: string
  /** Fuel requested in QT, lbs. */
  requestLbs: number
}

const num = (value: string): number | undefined => {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
const fmt = (n: number) => Math.round(n).toLocaleString()

// Where the requested fuel goes: left wing, right wing and (when the type has one) the center tank.
// The before-readings come off the airline's fuel sheet and are typed in; nothing is stored.
export function WingLoadingPanel({ aircraftType, requestLbs }: WingLoadingPanelProps) {
  const detected = findFuelType(aircraftType)
  const [typeKey, setTypeKey] = useState(detected?.key ?? '')
  const [open, setOpen] = useState(false)
  const [before, setBefore] = useState<Record<keyof TankLbs, string>>({ left: '', center: '', right: '' })
  const [density, setDensity] = useState(String(DEFAULT_DENSITY))
  const [wingMax, setWingMax] = useState('')

  const fuelType = AIRCRAFT_FUEL_TYPES.find((t) => t.key === typeKey) ?? detected
  // Nov-Mar uses the placard's winter wing figure.
  const winter = [10, 11, 0, 1, 2].includes(new Date().getMonth())

  const result = useMemo(
    () =>
      fuelType
        ? planWingLoad({
            capacity: fuelType,
            requestLbs,
            winter,
            density: num(density),
            wingMaxLbs: num(wingMax),
            before: { left: num(before.left), center: num(before.center), right: num(before.right) }
          })
        : null,
    [fuelType, requestLbs, winter, density, wingMax, before]
  )

  if (!fuelType || !result) return null

  const tanks: { key: keyof TankLbs; label: string }[] = [
    { key: 'left', label: 'Left wing' },
    ...(result.hasCenter ? [{ key: 'center' as const, label: 'Center' }] : []),
    { key: 'right', label: 'Right wing' }
  ]

  return (
    <div data-testid="wing-loading" className="rounded-md border border-border bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="font-medium text-foreground">
          Wing loading
          <span className="ml-2 font-mono text-muted-foreground">
            {tanks.map((t) => `${t.label[0]} ${fmt(result.add[t.key])}`).join(' · ')} lbs
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-2 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
              Density
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
                <th className="font-normal">Add lbs</th>
                <th className="font-normal">Add gal</th>
                <th className="font-normal">After</th>
              </tr>
            </thead>
            <tbody>
              {tanks.map((t) => (
                <tr key={t.key}>
                  <td className="text-left font-sans">{t.label}</td>
                  <td>
                    <Input
                      aria-label={`${t.label} before, lbs`}
                      inputMode="numeric"
                      placeholder="0"
                      value={before[t.key]}
                      onChange={(e) => setBefore({ ...before, [t.key]: e.target.value })}
                      className="ml-auto h-6 w-16 px-1 text-right text-xs"
                    />
                  </td>
                  <td>{fmt(result.add[t.key])}</td>
                  <td>{fmt(result.addGallons[t.key])}</td>
                  <td>{fmt(result.after[t.key])}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="text-left font-sans">Total</td>
                <td />
                <td>{fmt(result.totalAddLbs)}</td>
                <td>{fmt(result.totalAddGallons)}</td>
                <td>{fmt(result.totalAfterLbs)}</td>
              </tr>
            </tbody>
          </table>

          {result.warnings.map((w) => (
            <p key={w} className="text-destructive">
              {w}
            </p>
          ))}
          {!fuelType.verified && (
            <p className="text-muted-foreground">
              Capacities for this type are not yet confirmed from a fuel sheet; check the wing max.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
