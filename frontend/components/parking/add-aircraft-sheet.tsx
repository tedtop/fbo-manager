'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIRCRAFT_TYPES, DEFAULT_AIRCRAFT_TYPE } from '@/lib/aircraft-types'
import { normalizeTailNumber, tailNumberError } from '@/lib/parking-map'
import type { AircraftRow } from '@/repositories/aircraft.repo'
import { useEffect, useMemo, useState } from 'react'

interface AddAircraftSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aircraft that are not on the ramp yet. */
  available: readonly AircraftRow[]
  /** Existing tail numbers (parked or not), to catch duplicates when creating. */
  knownTailNumbers: ReadonlySet<string>
  onPlaceExisting: (tailNumber: string) => Promise<void>
  onCreateAndPlace: (tailNumber: string, typeId: string) => Promise<void>
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
  onPlaceExisting,
  onCreateAndPlace
}: AddAircraftSheetProps) {
  const [tab, setTab] = useState('existing')
  const [search, setSearch] = useState('')
  const [tail, setTail] = useState('')
  const [typeId, setTypeId] = useState(DEFAULT_AIRCRAFT_TYPE)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('existing')
    setSearch('')
    setTail('')
    setTypeId(DEFAULT_AIRCRAFT_TYPE)
    setError(null)
    setBusy(false)
  }, [open])

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
    void run(() => onCreateAndPlace(normalized, typeId))
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
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger id="new-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AIRCRAFT_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {t.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              disabled={busy}
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
