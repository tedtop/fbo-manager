'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReviewFlight } from '@/hooks/use-ocr-import'

interface OcrReviewTableProps {
  flights: ReviewFlight[]
  knownTails: Set<string>
  onChange: (flights: ReviewFlight[]) => void
}

function EditableCell({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('h-7 text-xs px-2 bg-transparent border-transparent hover:border-border focus:border-primary', className)}
    />
  )
}

export function OcrReviewTable({ flights, knownTails, onChange }: OcrReviewTableProps) {
  function update(id: string, patch: Partial<ReviewFlight>) {
    onChange(flights.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function remove(id: string) {
    onChange(flights.filter((f) => f.id !== id))
  }

  const included = flights.filter((f) => f.include).length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>{included} of {flights.length} flights selected for import</span>
        <span className="text-xs">Click any cell to edit</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-8 p-2" />
              <th className="text-left p-2 font-medium text-muted-foreground">Tail #</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Call Sign</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Arrival</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Departure</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Origin</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Dest</th>
              <th className="w-8 p-2" />
            </tr>
          </thead>
          <tbody>
            {flights.map((flight) => {
              const isKnown = knownTails.has(flight.tail_number)
              const hasError = flight.include && !flight.tail_number

              return (
                <tr
                  key={flight.id}
                  className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    !flight.include && 'opacity-40',
                    hasError && 'bg-destructive/5',
                  )}
                >
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={flight.include}
                      onCheckedChange={(v) => update(flight.id, { include: !!v })}
                    />
                  </td>

                  {/* Tail number with known/new indicator */}
                  <td className="p-1">
                    <div className="flex items-center gap-1">
                      {flight.tail_number ? (
                        isKnown ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        ) : (
                          <span title="New aircraft — will be auto-created">
                          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                        </span>
                        )
                      ) : null}
                      <EditableCell
                        value={flight.tail_number}
                        onChange={(v) => update(flight.id, { tail_number: v.toUpperCase() })}
                        placeholder="N12345"
                        className="font-mono font-semibold"
                      />
                    </div>
                  </td>

                  <td className="p-1">
                    <EditableCell
                      value={flight.aircraft_type_icao}
                      onChange={(v) => update(flight.id, { aircraft_type_icao: v.toUpperCase() })}
                      placeholder="B737"
                    />
                  </td>

                  <td className="p-1">
                    <EditableCell
                      value={flight.call_sign}
                      onChange={(v) => update(flight.id, { call_sign: v })}
                      placeholder="DAL123"
                    />
                  </td>

                  <td className="p-1">
                    <EditableCell
                      value={flight.arrival_time}
                      onChange={(v) => update(flight.id, { arrival_time: v })}
                      placeholder="14:30"
                    />
                  </td>

                  <td className="p-1">
                    <EditableCell
                      value={flight.departure_time}
                      onChange={(v) => update(flight.id, { departure_time: v })}
                      placeholder="16:00"
                    />
                  </td>

                  <td className="p-1">
                    <EditableCell
                      value={flight.origin}
                      onChange={(v) => update(flight.id, { origin: v.toUpperCase() })}
                      placeholder="KJFK"
                    />
                  </td>

                  <td className="p-1">
                    <EditableCell
                      value={flight.destination}
                      onChange={(v) => update(flight.id, { destination: v.toUpperCase() })}
                      placeholder="KLAX"
                    />
                  </td>

                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => remove(flight.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" /> Known aircraft
        </span>
        <span className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-amber-400" /> New aircraft (will be created)
        </span>
      </div>
    </div>
  )
}
