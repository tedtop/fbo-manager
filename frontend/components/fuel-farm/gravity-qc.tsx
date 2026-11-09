'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useGravity } from '@/hooks/use-gravity'
import { cn } from '@/lib/utils'
import type { GravitySaveResult } from '@/repositories/gravity.repo'
import { FlaskConical } from 'lucide-react'
import { useState } from 'react'

interface GravityQcProps {
  /** Combined capacity of the mixed tanks (T2-T7); sizes the averaging window. */
  farmCapacityGallons: number
  onError: (message: string) => void
  className?: string
}

const EMPTY = { temp: '', api: '', wheel: '', driver: '', sg: '', gallons: '' }
type Field = keyof typeof EMPTY

const FIELDS: { key: Field; label: string; step: string; placeholder?: string }[] = [
  { key: 'temp', label: 'Observed fuel temp (°F)', step: '1' },
  { key: 'api', label: 'Hydrometer reading (°API)', step: '0.1' },
  { key: 'wheel', label: 'Wheel reading @ 60°F (°API)', step: '0.1' },
  { key: 'driver', label: "Driver's BOL API gravity", step: '0.1' },
  { key: 'sg', label: "Driver's BOL specific gravity", step: '0.0001', placeholder: 'Optional' },
  { key: 'gallons', label: 'Gallons delivered', step: '1', placeholder: '~12000' }
]

/** Mixed-gravity summary card plus the "Log a load" form (a right-hand Sheet, per the house form convention). */
export function GravityQc({ farmCapacityGallons, onError, className }: GravityQcProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [invalid, setInvalid] = useState('')
  const [result, setResult] = useState<GravitySaveResult | null>(null)
  const { average, save, saving } = useGravity(farmCapacityGallons)

  const openSheet = () => {
    setResult(null)
    setInvalid('')
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const observedTempF = Number.parseFloat(form.temp)
    const observedApiGravity = Number.parseFloat(form.api)
    const wheelApiGravity60 = Number.parseFloat(form.wheel)
    const driverApiGravity = Number.parseFloat(form.driver)
    const gallonsDelivered = Number.parseFloat(form.gallons)
    const driverSpecificGravity = form.sg.trim() === '' ? null : Number.parseFloat(form.sg)

    if ([observedTempF, observedApiGravity, wheelApiGravity60, driverApiGravity, gallonsDelivered].some(Number.isNaN)) {
      return setInvalid('Fill in temp, hydrometer reading, wheel reading, driver gravity and gallons delivered.')
    }
    if (driverSpecificGravity !== null && Number.isNaN(driverSpecificGravity)) {
      return setInvalid("Driver's specific gravity must be a number.")
    }
    if (gallonsDelivered <= 0) return setInvalid('Gallons delivered must be greater than 0.')
    setInvalid('')

    try {
      setResult(
        await save({
          observedTempF,
          observedApiGravity,
          wheelApiGravity60,
          driverApiGravity,
          driverSpecificGravity,
          gallonsDelivered
        })
      )
      setForm(EMPTY)
    } catch (err) {
      console.error('Failed to save fuel gravity reading:', err)
      onError("Couldn't save the gravity reading")
    }
  }

  const stats = average
    ? [
        { label: 'Mixed API gravity', value: `${average.apiGravity60.toFixed(2)}°` },
        { label: 'Mixed sp. gravity', value: average.specificGravity60.toFixed(4) },
        { label: 'Density @ 60°F', value: `${average.densityLbsGal60.toFixed(3)} lbs/gal` },
        {
          label: 'Loads in window',
          value: `${average.sampleCount} (${Math.round(average.totalGallons).toLocaleString()} gal)`
        }
      ]
    : []

  return (
    <>
      <div
        className={cn('flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm', className)}
        data-testid="gravity-qc"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fuel load gravity QC
            </div>
            <div className="text-xs text-muted-foreground">Jet A receipts into T2–T7</div>
          </div>
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>

        {average ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                <dd className="text-base font-bold tabular-nums text-foreground">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
            No loads logged yet
          </div>
        )}

        <div className="min-h-3 flex-1" />
        <Button type="button" variant="outline" className="w-full" onClick={openSheet}>
          <FlaskConical className="mr-2 h-4 w-4" />
          Log a fuel load
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Log a fuel load</SheetTitle>
            <SheetDescription>
              Hydrometer reading and temp, then the GTP‑3012‑1A wheel&apos;s 60°F correction. The wheel reading must be
              within ±1.0 API of the driver&apos;s BOL to accept the load.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                  <Label htmlFor={`gravity-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`gravity-${f.key}`}
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    placeholder={f.placeholder}
                    className="text-right tabular-nums"
                    value={form[f.key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}

              {invalid && <p className="text-sm text-destructive">{invalid}</p>}

              {result && (
                <div
                  className={cn(
                    'rounded-lg border p-3 text-sm font-semibold',
                    result.acceptable
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-destructive/40 bg-destructive/10 text-destructive'
                  )}
                >
                  {result.acceptable
                    ? `Acceptable: Δ ${result.deltaApi.toFixed(2)}° API vs. driver`
                    : `Reject: Δ ${result.deltaApi.toFixed(2)}° API exceeds ±1.0`}
                  {result.formulaMismatch && (
                    <span className="mt-1 block text-xs font-normal text-warning-foreground dark:text-warning">
                      Computed cross-check ({result.computedApiGravity60}°) differs from the wheel reading by more than
                      0.3°. Double-check the wheel reading.
                    </span>
                  )}
                </div>
              )}
            </div>

            <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
                {result ? 'Close' : 'Cancel'}
              </Button>
              <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                {saving ? 'Saving...' : 'Save load'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
