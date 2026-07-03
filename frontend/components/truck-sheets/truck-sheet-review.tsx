'use client'

import { AlertCircle, AlertTriangle, CheckCircle2, Droplets, Info, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toNumber, type ReviewReading, type ReviewSheet } from '@/hooks/use-truck-sheet-import'
import { validateReadings, type ReadingIssue } from './reading-validation'

export const READING_TYPE_LABELS: Record<ReviewReading['reading_type'], string> = {
  fueling: 'Fueling',
  tank_fill: 'Tank fill',
  transfer_in: 'Xfer in',
  transfer_out: 'Xfer out',
  other: 'Other',
}

interface TruckSheetReviewProps {
  sheet: ReviewSheet
  knownTruckNumbers: Set<string>
  onChange: (sheet: ReviewSheet) => void
  onRemove: () => void
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
      className={cn(
        'h-7 text-xs px-2 bg-transparent border-transparent hover:border-border focus:border-primary',
        className,
      )}
    />
  )
}

function CellSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-xs hover:border-border focus:border-primary focus:outline-none',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function IssueIcon({ issues }: { issues: ReadingIssue[] | undefined }) {
  if (!issues || issues.length === 0) return null
  const hasWarn = issues.some((i) => i.level === 'warn')
  const title = issues.map((i) => i.message).join('\n')
  return (
    <span title={title}>
      {hasWarn ? (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
      ) : (
        <Info className="w-3.5 h-3.5 text-sky-400" />
      )}
    </span>
  )
}

export function TruckSheetReview({
  sheet,
  knownTruckNumbers,
  onChange,
  onRemove,
}: TruckSheetReviewProps) {
  function patch(p: Partial<ReviewSheet>) {
    onChange({ ...sheet, ...p })
  }

  function patchReading(id: string, p: Partial<ReviewReading>) {
    patch({ readings: sheet.readings.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  }

  function removeReading(id: string) {
    patch({ readings: sheet.readings.filter((r) => r.id !== id) })
  }

  const issues = validateReadings(
    sheet.readings.map((r) => ({
      meter: r.meter,
      meter_start: toNumber(r.meter_start),
      meter_end: toNumber(r.meter_end),
      gallons_pumped: toNumber(r.gallons_pumped),
    }))
  )

  const isJetA = sheet.fuel_type === 'jet_a'
  const truckKnown = knownTruckNumbers.has(sheet.truck_number)
  const included = sheet.readings.filter((r) => r.include).length
  const totalDispensed = sheet.readings
    .filter((r) => r.include && r.reading_type === 'fueling')
    .reduce((sum, r) => sum + (toNumber(r.gallons_pumped) ?? 0), 0)

  return (
    <Card className="p-4 space-y-4">
      {/* Sheet header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Droplets className={cn('w-5 h-5', isJetA ? 'text-sky-400' : 'text-emerald-400')} />
          <span className="font-semibold text-lg">Truck {sheet.truck_number || '?'}</span>
          <Badge variant={isJetA ? 'default' : 'secondary'}>
            {sheet.fuel_type === 'jet_a' ? 'Jet A' : sheet.fuel_type === 'avgas' ? 'Avgas' : 'Fuel type?'}
          </Badge>
          {truckKnown ? (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 className="w-3 h-3" /> Known truck
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle className="w-3 h-3" /> New truck — will be added to equipment
            </span>
          )}
          {sheet.page_count > 1 && (
            <Badge variant="outline">{sheet.page_count} pages merged</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} title="Discard this sheet">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={sheet.sheet_date}
            onChange={(e) => patch({ sheet_date: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Truck #</Label>
          <Input
            value={sheet.truck_number}
            onChange={(e) => patch({ truck_number: e.target.value.trim() })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Fuel type</Label>
          <select
            value={sheet.fuel_type}
            onChange={(e) => patch({ fuel_type: e.target.value as ReviewSheet['fuel_type'] })}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:border-primary"
          >
            <option value="">—</option>
            <option value="jet_a">Jet A</option>
            <option value="avgas">Avgas</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Gallons down</Label>
          <Input
            value={sheet.gallons_down}
            onChange={(e) => patch({ gallons_down: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Starting gal</Label>
          <Input
            value={sheet.starting_gallons}
            onChange={(e) => patch({ starting_gallons: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Front meter</Label>
          <Input
            value={sheet.front_meter_start}
            onChange={(e) => patch({ front_meter_start: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Rear meter</Label>
          <Input
            value={sheet.rear_meter_start}
            onChange={(e) => patch({ rear_meter_start: e.target.value })}
            placeholder="—"
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Initials</Label>
          <Input
            value={sheet.fueler_initials}
            onChange={(e) => patch({ fueler_initials: e.target.value.toUpperCase() })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Readings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>
            {included} of {sheet.readings.length} readings selected · {totalDispensed.toFixed(1)} gal
            dispensed to aircraft
          </span>
          <span className="text-xs">Click any cell to edit</span>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs min-w-[64rem]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-8 p-2" />
                <th className="w-6 p-2" />
                <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Customer</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Tail #</th>
                <th className="text-left p-2 font-medium text-muted-foreground">A/C</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Meter</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Start</th>
                <th className="text-left p-2 font-medium text-muted-foreground">End</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Pumped</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Remaining</th>
                {isJetA && <th className="text-left p-2 font-medium text-muted-foreground">Prist</th>}
                <th className="text-left p-2 font-medium text-muted-foreground">Req</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Tech</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Invoice</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Time</th>
                <th className="w-8 p-2" />
              </tr>
            </thead>
            <tbody>
              {sheet.readings.map((reading, idx) => (
                <tr
                  key={reading.id}
                  className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    !reading.include && 'opacity-40',
                    reading.reading_type !== 'fueling' && 'bg-muted/30',
                  )}
                >
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={reading.include}
                      onCheckedChange={(v) => patchReading(reading.id, { include: !!v })}
                    />
                  </td>
                  <td className="p-1 text-center">
                    <IssueIcon issues={issues.get(idx)} />
                  </td>
                  <td className="p-1">
                    <CellSelect
                      value={reading.reading_type}
                      onChange={(v) =>
                        patchReading(reading.id, { reading_type: v as ReviewReading['reading_type'] })
                      }
                      options={Object.entries(READING_TYPE_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.customer}
                      onChange={(v) => patchReading(reading.id, { customer: v })}
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.tail_number}
                      onChange={(v) => patchReading(reading.id, { tail_number: v.toUpperCase() })}
                      className="font-mono font-semibold"
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.aircraft_type}
                      onChange={(v) => patchReading(reading.id, { aircraft_type: v.toUpperCase() })}
                    />
                  </td>
                  <td className="p-1">
                    <CellSelect
                      value={reading.meter}
                      onChange={(v) => patchReading(reading.id, { meter: v as ReviewReading['meter'] })}
                      options={[
                        { value: '', label: '—' },
                        { value: 'front', label: 'Front' },
                        { value: 'rear', label: 'Rear' },
                      ]}
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.meter_start}
                      onChange={(v) => patchReading(reading.id, { meter_start: v })}
                      className="font-mono"
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.meter_end}
                      onChange={(v) => patchReading(reading.id, { meter_end: v })}
                      className="font-mono"
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.gallons_pumped}
                      onChange={(v) => patchReading(reading.id, { gallons_pumped: v })}
                      className="font-mono"
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.gallons_remaining}
                      onChange={(v) => patchReading(reading.id, { gallons_remaining: v })}
                      className="font-mono"
                    />
                  </td>
                  {isJetA && (
                    <td className="p-1">
                      <CellSelect
                        value={reading.prist}
                        onChange={(v) => patchReading(reading.id, { prist: v as ReviewReading['prist'] })}
                        options={[
                          { value: '', label: '—' },
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ]}
                      />
                    </td>
                  )}
                  <td className="p-1">
                    <EditableCell
                      value={reading.req_gals_or_lbs}
                      onChange={(v) => patchReading(reading.id, { req_gals_or_lbs: v })}
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.line_tech_initials}
                      onChange={(v) =>
                        patchReading(reading.id, { line_tech_initials: v.toUpperCase() })
                      }
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.invoice_number}
                      onChange={(v) => patchReading(reading.id, { invoice_number: v })}
                    />
                  </td>
                  <td className="p-1">
                    <EditableCell
                      value={reading.service_time}
                      onChange={(v) => patchReading(reading.id, { service_time: v })}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeReading(reading.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> Meter math doesn&apos;t add up — check the digits
          </span>
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3 text-sky-400" /> Register gap between rows
          </span>
        </div>
      </div>
    </Card>
  )
}
