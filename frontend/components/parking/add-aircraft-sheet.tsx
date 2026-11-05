'use client'

import { AircraftTypeCombobox } from '@/components/flight-operations/aircraft-type-combobox'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAircraftTypeLookup } from '@/hooks/use-aircraft-type-lookup'
import {
  type AircraftTypeChoice,
  UNKNOWN_AIRCRAFT_TYPE,
  effectiveAircraftType,
  tailForLookup
} from '@/lib/new-aircraft-type'
import { normalizeTailNumber, tailNumberError } from '@/lib/parking-map'
import type { AircraftRow } from '@/repositories/aircraft.repo'
import { useEffect, useMemo, useState } from 'react'

const LOOKUP_DEBOUNCE_MS = 400

interface AddAircraftSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aircraft that are not on the ramp yet. */
  available: readonly AircraftRow[]
  /** Existing tail numbers (parked or not), to catch duplicates when creating. */
  knownTailNumbers: ReadonlySet<string>
  /** Aircraft per ICAO type code, to rank the type picker. */
  usageCounts: Record<string, number>
  onPlaceExisting: (tailNumber: string) => Promise<void>
  onCreateAndPlace: (
    tailNumber: string,
    type: AircraftTypeChoice
  ) => Promise<void>
}

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'Could not add the airplane.'
}

export function AddAircraftSheet({
  open,
  onOpenChange,
  available,
  knownTailNumbers,
  usageCounts,
  onPlaceExisting,
  onCreateAndPlace
}: AddAircraftSheetProps) {
  const [tab, setTab] = useState('existing')
  const [search, setSearch] = useState('')
  const [tail, setTail] = useState('')
  // Only a type the user picked by hand; the registry lookup never writes here.
  const [pickedType, setPickedType] = useState<AircraftTypeChoice | null>(null)
  const [debouncedTail, setDebouncedTail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('existing')
    setSearch('')
    setTail('')
    setPickedType(null)
    setDebouncedTail('')
    setError(null)
    setBusy(false)
  }, [open])

  // Wait for a pause in typing so the registry is not queried on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTail(tail), LOOKUP_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [tail])

  const currentLookupTail = tailForLookup(tail, knownTailNumbers)
  const lookupTail = currentLookupTail === debouncedTail ? debouncedTail : null
  const typeLookup = useAircraftTypeLookup(lookupTail)
  const lookupPending =
    !pickedType &&
    currentLookupTail !== null &&
    (lookupTail === null || typeLookup.isFetching)
  const lookingUpType =
    !pickedType && lookupTail !== null && typeLookup.isFetching
  const lookupMissed =
    !pickedType &&
    lookupTail !== null &&
    !typeLookup.isFetching &&
    !typeLookup.data
  const type = effectiveAircraftType(pickedType, lookupTail, typeLookup.data)

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (a) =>
        a.tail_number.toLowerCase().includes(q) ||
        a.aircraft_type_display.toLowerCase().includes(q)
    )
  }, [available, search])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onOpenChange(false)
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = normalizeTailNumber(tail)
    const problem = tailNumberError(normalized)
    if (problem) {
      setError(problem)
      return
    }
    if (knownTailNumbers.has(normalized)) {
      setError(
        `${normalized} already exists. Choose it from the Existing aircraft tab.`
      )
      return
    }
    void run(() => onCreateAndPlace(normalized, type ?? UNKNOWN_AIRCRAFT_TYPE))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Add Airplane</SheetTitle>
          <SheetDescription>
            Put an aircraft on the ramp. It appears at the centre of the map;
            drag it into place.
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v)
            setError(null)
          }}
          className="flex flex-1 flex-col gap-0 overflow-hidden"
        >
          <TabsList className="mx-4 mt-4 grid grid-cols-2">
            <TabsTrigger value="existing">Existing aircraft</TabsTrigger>
            <TabsTrigger value="new">New aircraft</TabsTrigger>
          </TabsList>

          <TabsContent
            value="existing"
            className="flex flex-1 flex-col gap-3 overflow-hidden p-4"
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tail number or type"
              aria-label="Search aircraft"
            />
            <ul className="flex-1 space-y-1 overflow-y-auto">
              {matches.map((a) => (
                <li key={a.tail_number}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onPlaceExisting(a.tail_number))}
                    className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  >
                    <span className="font-medium">{a.tail_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.aircraft_type_display || a.aircraft_type_icao}
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  {available.length === 0
                    ? 'Every known aircraft is already on the ramp.'
                    : 'No aircraft match that search.'}
                </li>
              )}
            </ul>
          </TabsContent>

          <TabsContent value="new" className="flex-1 overflow-hidden">
            <form
              onSubmit={handleCreate}
              id="new-aircraft-form"
              className="space-y-4 p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="new-tail">Tail number</Label>
                <Input
                  id="new-tail"
                  value={tail}
                  maxLength={10}
                  placeholder="e.g. N172SP"
                  onChange={(e) => setTail(normalizeTailNumber(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-type">Aircraft type</Label>
                <AircraftTypeCombobox
                  id="new-type"
                  value={type?.display ?? ''}
                  icao={type?.icao}
                  usageCounts={usageCounts}
                  onSelect={(display, icao) => setPickedType({ display, icao })}
                  loading={lookingUpType}
                />
                {lookupMissed && (
                  <p className="text-xs text-muted-foreground">
                    No registry match; pick a type
                  </p>
                )}
              </div>
            </form>
          </TabsContent>
        </Tabs>

        {error && (
          <p role="alert" className="px-4 pb-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          {tab === 'new' && (
            <Button
              type="submit"
              form="new-aircraft-form"
              disabled={busy || lookupPending}
              className="w-full sm:w-auto"
            >
              {busy ? 'Adding...' : 'Create and place'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
