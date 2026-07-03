'use client'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCustomers } from '@/hooks/use-customers'
import { useFuelTrucks } from '@/hooks/use-fuel-trucks'
import {
  useInvoices,
  useNextInvoiceNumber,
  useUnbilledFuelings
} from '@/hooks/use-invoices'
import { useProducts } from '@/hooks/use-products'
import { cn } from '@/lib/utils'
import {
  type UnbilledFueling,
  isDigitalEntryReading
} from '@/repositories/fueling-events.repo'
import type {
  InvoiceWithItems,
  NewInvoiceInput,
  PaymentMethod,
  TicketFuelType
} from '@/repositories/invoices.repo'
import {
  AlertTriangle,
  CircleCheck,
  Fuel,
  Link2,
  TriangleAlert
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CustomerCombobox } from './customer-combobox'
import { PaymentMethodField } from './payment-method-field'
import {
  PositionReadingsEditor,
  emptyReading
} from './position-readings-editor'
import { ServiceItemsEditor, serviceLineTotal } from './service-items-editor'
import {
  type PositionReading,
  formatCurrency,
  formatGallons,
  lbsToGallons,
  lineAmount,
  meterDelta,
  parseNum,
  poundsUplifted,
  validateTicket
} from './ticket-math'
import {
  FUEL_TYPE_TICKET_LABELS,
  type PositionReadingDraft,
  type ServiceLineDraft,
  draftKey
} from './types'

const FUEL_TYPES: TicketFuelType[] = [
  'jet_a',
  'avgas_100',
  'avgas_80',
  'unleaded'
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FuelTicketSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Reopening a saved draft prefills the form; saving replaces the draft. */
  editingDraft: InvoiceWithItems | null
  onSaved: (invoice: InvoiceWithItems, finalized: boolean) => void
}

/**
 * The digital fuel ticket. Field order mirrors the paper Minuteman ticket
 * so line techs can transcribe on muscle memory; the reconciliation strip
 * live-checks the same math a supervisor would do with a calculator.
 */
export function FuelTicketSheet({
  open,
  onOpenChange,
  editingDraft,
  onSaved
}: FuelTicketSheetProps) {
  const { customers } = useCustomers()
  const { products } = useProducts()
  const { trucks } = useFuelTrucks()
  const { createInvoice, creating, replaceDraft, replacingDraft } =
    useInvoices()
  const { nextNumber } = useNextInvoiceNumber(open && !editingDraft)
  const { fuelings: unbilled } = useUnbilledFuelings(open)

  // ---- Header fields
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [salesmanInitials, setSalesmanInitials] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [station, setStation] = useState('')
  const [tailNumber, setTailNumber] = useState('')
  const [aircraftType, setAircraftType] = useState('')

  // ---- Fuel section
  const [hasFuel, setHasFuel] = useState(true)
  const [fuelType, setFuelType] = useState<TicketFuelType>('jet_a')
  const [truckId, setTruckId] = useState('')
  const [meterStart, setMeterStart] = useState('')
  const [meterStop, setMeterStop] = useState('')
  const [quantity, setQuantity] = useState('')
  const quantityTouched = useRef(false)
  const [price, setPrice] = useState('')
  const [density, setDensity] = useState('')
  const [requestedAmount, setRequestedAmount] = useState('')
  const [serviceTime, setServiceTime] = useState('')
  const [readings, setReadings] = useState<PositionReadingDraft[]>([])
  /** OCR-imported truck-sheet event being billed: meter fields are read-only. */
  const [linkedFueling, setLinkedFueling] = useState<UnbilledFueling | null>(
    null
  )
  /** Digital-entry event owned by the draft being edited: rewritten on save. */
  const [replaceReadingId, setReplaceReadingId] = useState<number | null>(null)
  const [lockedTruckLabel, setLockedTruckLabel] = useState<string | null>(null)
  const [fuelingPickerOpen, setFuelingPickerOpen] = useState(false)

  // ---- Services & payment
  const [serviceItems, setServiceItems] = useState<ServiceLineDraft[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [checkNumber, setCheckNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Reset / prefill whenever the sheet opens
  useEffect(() => {
    if (!open) return
    const draft = editingDraft
    const fuelLine =
      draft?.line_items.find((li) => li.item_type === 'fuel') ?? null
    const reading = fuelLine?.meter_reading ?? null
    const digital = reading != null && isDigitalEntryReading(reading)

    setInvoiceNumber(draft?.invoice_number ?? '')
    setInvoiceDate(draft?.invoice_date ?? today())
    setSalesmanInitials(draft?.salesman_initials ?? '')
    setCustomerId(draft?.customer_id ?? null)
    setCustomerName(draft?.customer_name ?? '')
    setStation(draft?.station ?? '')
    setTailNumber(draft?.tail_number ?? '')
    setAircraftType(draft?.aircraft_type ?? '')

    setHasFuel(draft ? fuelLine != null : true)
    setFuelType(fuelLine?.fuel_type ?? 'jet_a')
    setTruckId(
      digital && reading?.truck_sheet
        ? String(reading.truck_sheet.fuel_truck_id)
        : ''
    )
    setMeterStart(
      reading?.meter_start != null ? String(reading.meter_start) : ''
    )
    setMeterStop(reading?.meter_end != null ? String(reading.meter_end) : '')
    setQuantity(fuelLine?.quantity != null ? String(fuelLine.quantity) : '')
    quantityTouched.current = fuelLine != null
    setPrice(fuelLine?.unit_price != null ? String(fuelLine.unit_price) : '')
    setDensity(fuelLine?.density != null ? String(fuelLine.density) : '')
    setRequestedAmount(fuelLine?.requested_amount ?? '')
    setServiceTime(fuelLine?.service_time ?? '')
    setReadings(
      fuelLine?.fuel_readings.map((r) => ({
        key: draftKey(),
        position: r.position,
        start: String(r.reading_start),
        end: String(r.reading_end)
      })) ?? []
    )
    setLinkedFueling(null)
    setReplaceReadingId(digital && reading ? reading.id : null)
    setLockedTruckLabel(
      !digital && reading?.truck_sheet ? reading.truck_sheet.truck_number : null
    )
    // Non-digital linked reading on a draft: keep billing the same event
    if (!digital && reading != null) {
      setLinkedFuelingFromRow(reading as unknown as UnbilledFueling)
    }

    setServiceItems(
      draft?.line_items
        .filter((li) => li.item_type !== 'fuel')
        .map((li) => ({
          key: draftKey(),
          itemType: li.item_type as ServiceLineDraft['itemType'],
          productId: li.product_id,
          description: li.description,
          quantity: String(li.quantity),
          unitPrice: String(li.unit_price)
        })) ?? []
    )
    setPaymentMethod(draft?.payment_method ?? null)
    setCheckNumber(draft?.check_number ?? '')
    setNotes(draft?.notes ?? '')
    setFormError('')
    setTimeout(() => firstFieldRef.current?.focus(), 50)
  }, [open, editingDraft])

  // Suggest the next number for new tickets (still hand-editable). Reads
  // invoiceNumber to avoid clobbering a hand-typed value but intentionally
  // excludes it from deps — it should only fire when the suggestion arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (open && !editingDraft && nextNumber && !invoiceNumber) {
      setInvoiceNumber(nextNumber)
    }
  }, [nextNumber, open, editingDraft])

  const setLinkedFuelingFromRow = (row: UnbilledFueling) => {
    setLinkedFueling(row)
  }

  const applyUnbilledFueling = (row: UnbilledFueling) => {
    setLinkedFueling(row)
    setReplaceReadingId(null)
    setLockedTruckLabel(row.truck_sheet?.truck_number ?? null)
    setFuelingPickerOpen(false)
    setHasFuel(true)
    if (row.customer) setCustomerName(row.customer)
    if (row.tail_number) setTailNumber(row.tail_number)
    if (row.aircraft_type) setAircraftType(row.aircraft_type)
    if (row.line_tech_initials) setSalesmanInitials(row.line_tech_initials)
    if (row.service_time) setServiceTime(row.service_time)
    if (row.req_gals_or_lbs) setRequestedAmount(row.req_gals_or_lbs)
    if (row.truck_sheet) {
      setFuelType(row.truck_sheet.fuel_type === 'jet_a' ? 'jet_a' : 'avgas_100')
      setStation((prev) => prev || `MSO w/${row.truck_sheet?.truck_number}`)
      setInvoiceDate(row.truck_sheet.sheet_date)
    }
    setMeterStart(row.meter_start != null ? String(row.meter_start) : '')
    setMeterStop(row.meter_end != null ? String(row.meter_end) : '')
    if (row.gallons_pumped != null) {
      setQuantity(String(row.gallons_pumped))
      quantityTouched.current = true
    }
  }

  const clearLinkedFueling = () => {
    setLinkedFueling(null)
    setLockedTruckLabel(null)
    setMeterStart('')
    setMeterStop('')
  }

  const meterLocked = linkedFueling != null

  // Quantity follows the truck meter until the tech types their own figure
  const meterStartNum = parseNum(meterStart)
  const meterStopNum = parseNum(meterStop)
  const delta = meterDelta({
    meter_start: meterStartNum,
    meter_stop: meterStopNum
  })
  useEffect(() => {
    if (!quantityTouched.current && delta != null && delta >= 0) {
      setQuantity(delta.toFixed(1))
    }
  }, [delta])

  const quantityNum = parseNum(quantity)
  const priceNum = parseNum(price)
  const densityNum = parseNum(density)

  const positionReadings: PositionReading[] = useMemo(
    () =>
      readings.map((r) => ({
        position: r.position,
        reading_start: parseNum(r.start),
        reading_end: parseNum(r.end)
      })),
    [readings]
  )

  const issues = useMemo(
    () =>
      hasFuel
        ? validateTicket({
            meter_start: meterStartNum,
            meter_stop: meterStopNum,
            quantity_gallons: quantityNum,
            price_per_gallon: priceNum,
            density: densityNum,
            readings: positionReadings
          })
        : [],
    [
      hasFuel,
      meterStartNum,
      meterStopNum,
      quantityNum,
      priceNum,
      densityNum,
      positionReadings
    ]
  )
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warn')

  const fuelAmount =
    hasFuel && quantityNum != null && priceNum != null
      ? lineAmount(quantityNum, priceNum)
      : 0
  const servicesTotal = serviceLineTotal(serviceItems)
  const total = Math.round((fuelAmount + servicesTotal) * 100) / 100

  const lbs = poundsUplifted(positionReadings)
  const impliedGallons =
    lbs != null && densityNum != null && densityNum > 0
      ? lbsToGallons(lbs, densityNum)
      : null

  const selectedTruck = trucks.find((t) => String(t.id) === truckId) ?? null

  const completionBlockers = useMemo(() => {
    const blockers: string[] = []
    if (!invoiceNumber.trim()) blockers.push('Invoice number is required')
    if (!customerName.trim()) blockers.push('Customer name is required')
    if (!paymentMethod) blockers.push('Pick a payment method')
    if (paymentMethod === 'check' && !checkNumber.trim())
      blockers.push('Check number is required')
    if (
      (paymentMethod === 'eom' || paymentMethod === 'roa') &&
      customerId == null
    )
      blockers.push('E.O.M. / R.O.A. needs a linked customer account')
    if (hasFuel) {
      if (!meterLocked && !selectedTruck) blockers.push('Select the fuel truck')
      if (quantityNum == null || quantityNum <= 0)
        blockers.push('Enter the quantity delivered')
      if (priceNum == null) blockers.push('Enter the price per gallon')
    } else if (serviceItems.length === 0) {
      blockers.push('Add at least one line item')
    }
    for (const e of errors) blockers.push(e.message)
    return blockers
  }, [
    invoiceNumber,
    customerName,
    paymentMethod,
    checkNumber,
    customerId,
    hasFuel,
    meterLocked,
    selectedTruck,
    quantityNum,
    priceNum,
    serviceItems.length,
    errors
  ])

  const saving = creating || replacingDraft

  const buildInput = (finalize: boolean): NewInvoiceInput => ({
    header: {
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      customerId,
      customerName: customerName.trim(),
      station: station.trim() || null,
      tailNumber: tailNumber.trim().toUpperCase() || null,
      aircraftType: aircraftType.trim().toUpperCase() || null,
      flightId: linkedFueling?.flight_id ?? null,
      paymentMethod,
      checkNumber: checkNumber.trim() || null,
      salesmanInitials: salesmanInitials.trim().toUpperCase() || null,
      notes: notes.trim() || null
    },
    fuelLine: hasFuel
      ? {
          truckMeterReadingId: linkedFueling?.id,
          newFueling:
            linkedFueling == null && selectedTruck
              ? {
                  fuelTruckId: selectedTruck.id,
                  truckNumber: selectedTruck.equipment_id,
                  meterStart: meterStartNum,
                  meterStop: meterStopNum
                }
              : undefined,
          replaceFuelingReadingId:
            linkedFueling == null ? (replaceReadingId ?? undefined) : undefined,
          fuelType,
          quantityGallons: quantityNum ?? 0,
          pricePerGallon: priceNum ?? 0,
          density: densityNum,
          requestedAmount: requestedAmount.trim() || null,
          serviceTime: serviceTime.trim() || null,
          readings: positionReadings
        }
      : null,
    serviceLines: serviceItems
      .filter(
        (item) =>
          item.description.trim() &&
          parseNum(item.quantity) != null &&
          parseNum(item.unitPrice) != null
      )
      .map((item) => ({
        itemType: item.itemType,
        productId: item.productId,
        description: item.description.trim(),
        quantity: parseNum(item.quantity) as number,
        unitPrice: parseNum(item.unitPrice) as number
      })),
    finalize
  })

  const handleSave = async (finalize: boolean) => {
    setFormError('')
    if (!invoiceNumber.trim() || !customerName.trim()) {
      setFormError('Invoice number and customer name are required')
      return
    }
    if (finalize && completionBlockers.length > 0) return
    try {
      const input = buildInput(finalize)
      const invoice = editingDraft
        ? await replaceDraft({ draft: editingDraft, input })
        : await createInvoice(input)
      onSaved(invoice, finalize)
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : 'Failed to save ticket'
      setFormError(
        message.includes('duplicate') && message.includes('invoice_number')
          ? `Invoice #${invoiceNumber.trim()} already exists`
          : message
      )
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (completionBlockers.length === 0 && !saving) void handleSave(true)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl"
        onKeyDown={handleKeyDown}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-mono text-base tracking-wide">
            <Fuel className="h-4 w-4 text-primary" />
            {editingDraft
              ? `EDIT TICKET · DRAFT #${editingDraft.invoice_number}`
              : 'FUEL TICKET'}
          </SheetTitle>
          <SheetDescription>
            Federal and state tax included in the price per gallon.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* ── Ticket header row ────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label
                htmlFor="tk-number"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Invoice #
              </Label>
              <Input
                id="tk-number"
                ref={firstFieldRef}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="h-9 font-mono font-semibold tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="tk-date"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Date
              </Label>
              <Input
                id="tk-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="h-9 font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="tk-salesman"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Salesman
              </Label>
              <Input
                id="tk-salesman"
                value={salesmanInitials}
                onChange={(e) => setSalesmanInitials(e.target.value)}
                placeholder="Initials"
                maxLength={4}
                className="h-9 font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="tk-station"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Address / Station
              </Label>
              <Input
                id="tk-station"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="MSO w/5282"
                className="h-9 font-mono"
              />
            </div>
          </div>

          {/* ── Aircraft & customer ──────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <CustomerCombobox
                customers={customers}
                customerId={customerId}
                customerName={customerName}
                onChange={(id, name) => {
                  setCustomerId(id)
                  setCustomerName(name)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="tk-tail"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Aircraft No.
              </Label>
              <Input
                id="tk-tail"
                value={tailNumber}
                onChange={(e) => setTailNumber(e.target.value)}
                placeholder="N37527"
                className="h-9 font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="tk-actype"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Aircraft Type
              </Label>
              <Input
                id="tk-actype"
                value={aircraftType}
                onChange={(e) => setAircraftType(e.target.value)}
                placeholder="E175"
                className="h-9 font-mono uppercase"
              />
            </div>
          </div>

          <Separator />

          {/* ── Fuel delivery ────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Label htmlFor="tk-hasfuel" className="text-sm font-semibold">
                  Fuel delivery
                </Label>
                <Switch
                  id="tk-hasfuel"
                  checked={hasFuel}
                  onCheckedChange={setHasFuel}
                />
              </div>
              {hasFuel && !linkedFueling && unbilled.length > 0 && (
                <Popover
                  open={fuelingPickerOpen}
                  onOpenChange={setFuelingPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                    >
                      <Link2 className="mr-1.5 h-3 w-3" />
                      Bill from truck sheet ({unbilled.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[380px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search tail, customer, truck…" />
                      <CommandList>
                        <CommandEmpty>No unbilled fuelings.</CommandEmpty>
                        <CommandGroup heading="Unbilled fuelings (14 days)">
                          {unbilled.map((row) => (
                            <CommandItem
                              key={row.id}
                              value={`${row.tail_number ?? ''} ${row.customer ?? ''} ${row.truck_sheet?.truck_number ?? ''}`}
                              onSelect={() => applyUnbilledFueling(row)}
                            >
                              <span className="font-mono text-xs">
                                {row.truck_sheet?.truck_number ?? '—'}
                              </span>
                              <span className="mx-2 truncate">
                                {row.customer ?? '—'} · {row.tail_number ?? '—'}
                              </span>
                              <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                                {row.gallons_pumped != null
                                  ? `${formatGallons(row.gallons_pumped)} gal`
                                  : '—'}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {linkedFueling && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3 text-primary" />
                  Truck sheet {lockedTruckLabel ?? ''} · line{' '}
                  {linkedFueling.line_number}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={clearLinkedFueling}
                  >
                    Unlink
                  </Button>
                </div>
              )}
            </div>

            {hasFuel && (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                {/* Fuel type + truck */}
                <div className="flex flex-wrap items-end gap-4">
                  <RadioGroup
                    value={fuelType}
                    onValueChange={(v) => setFuelType(v as TicketFuelType)}
                    className="flex gap-1.5"
                    aria-label="Fuel type"
                  >
                    {FUEL_TYPES.map((ft) => (
                      <Label
                        key={ft}
                        htmlFor={`fuel-${ft}`}
                        className="flex cursor-pointer items-center rounded-md border px-3 py-1.5 font-mono text-xs font-bold tracking-wide transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
                      >
                        <RadioGroupItem
                          value={ft}
                          id={`fuel-${ft}`}
                          className="sr-only"
                        />
                        {FUEL_TYPE_TICKET_LABELS[ft]}
                      </Label>
                    ))}
                  </RadioGroup>
                  <div className="min-w-44 flex-1 space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Fuel truck
                    </Label>
                    {meterLocked ? (
                      <div className="flex h-8 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm">
                        {lockedTruckLabel ?? '—'}
                      </div>
                    ) : (
                      <Select value={truckId} onValueChange={setTruckId}>
                        <SelectTrigger
                          className="h-8 font-mono"
                          aria-label="Fuel truck"
                        >
                          <SelectValue placeholder="Truck…" />
                        </SelectTrigger>
                        <SelectContent>
                          {trucks.map((truck) => (
                            <SelectItem key={truck.id} value={String(truck.id)}>
                              {truck.equipment_id} — {truck.equipment_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Truck meter + quantity */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-meterstop"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Meter at stop
                    </Label>
                    <Input
                      id="tk-meterstop"
                      inputMode="decimal"
                      value={meterStop}
                      onChange={(e) => setMeterStop(e.target.value)}
                      disabled={meterLocked}
                      className="h-9 text-right font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-meterstart"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Less reading start
                    </Label>
                    <Input
                      id="tk-meterstart"
                      inputMode="decimal"
                      value={meterStart}
                      onChange={(e) => setMeterStart(e.target.value)}
                      disabled={meterLocked}
                      className="h-9 text-right font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                      Gallons delivered
                    </span>
                    <div className="flex h-9 items-center justify-end rounded-md border border-dashed px-3 font-mono text-sm tabular-nums text-muted-foreground">
                      {delta != null ? formatGallons(delta) : '—'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-quantity"
                      className="text-[11px] font-semibold uppercase tracking-wider text-primary"
                    >
                      Quantity (gal)
                    </Label>
                    <Input
                      id="tk-quantity"
                      inputMode="decimal"
                      value={quantity}
                      onChange={(e) => {
                        quantityTouched.current = true
                        setQuantity(e.target.value)
                      }}
                      className="h-9 border-primary/50 text-right font-mono text-lg font-bold tabular-nums"
                    />
                  </div>
                </div>

                {/* Req / time / density / price */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-req"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Req (gals / lbs)
                    </Label>
                    <Input
                      id="tk-req"
                      value={requestedAmount}
                      onChange={(e) => setRequestedAmount(e.target.value)}
                      placeholder="15800"
                      className="h-9 font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-time"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Time
                    </Label>
                    <Input
                      id="tk-time"
                      value={serviceTime}
                      onChange={(e) => setServiceTime(e.target.value)}
                      placeholder="0535-0550"
                      className="h-9 font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-density"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Density (lbs/gal)
                    </Label>
                    <Input
                      id="tk-density"
                      inputMode="decimal"
                      value={density}
                      onChange={(e) => setDensity(e.target.value)}
                      placeholder="6.81"
                      className="h-9 text-right font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="tk-price"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      Price / gal
                    </Label>
                    <Input
                      id="tk-price"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="6.45"
                      className="h-9 text-right font-mono tabular-nums"
                    />
                  </div>
                </div>

                {/* Gauge readings */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                    Gauge readings — start · position · end
                  </span>
                  <PositionReadingsEditor
                    readings={readings}
                    onChange={setReadings}
                  />
                </div>

                {/* Reconciliation strip */}
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border px-3 py-2 font-mono text-xs tabular-nums',
                    errors.length > 0
                      ? 'border-destructive/40 bg-destructive/5 text-destructive'
                      : warnings.length > 0
                        ? 'border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                        : 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400'
                  )}
                >
                  {errors.length === 0 && warnings.length === 0 ? (
                    <CircleCheck className="h-3.5 w-3.5" />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5" />
                  )}
                  <span>
                    METER Δ {delta != null ? formatGallons(delta) : '—'} gal
                  </span>
                  <span>
                    GAUGES {lbs != null ? `${lbs.toFixed(0)} lbs` : '—'}
                  </span>
                  <span>
                    ⇒{' '}
                    {impliedGallons != null
                      ? `${formatGallons(impliedGallons)} gal`
                      : '—'}
                  </span>
                  <span>
                    TICKET{' '}
                    {quantityNum != null ? formatGallons(quantityNum) : '—'} gal
                  </span>
                  <span className="ml-auto font-semibold">
                    {quantityNum != null && priceNum != null
                      ? formatCurrency(lineAmount(quantityNum, priceNum))
                      : '—'}
                  </span>
                </div>
                {warnings.map((w) => (
                  <p
                    key={w.message}
                    className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {w.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* ── Services / other items ───────────────────────── */}
          <div className="space-y-2">
            <span className="text-sm font-semibold">
              Services & other items
            </span>
            <ServiceItemsEditor
              items={serviceItems}
              onChange={setServiceItems}
              products={products}
            />
          </div>

          <Separator />

          {/* ── Payment ──────────────────────────────────────── */}
          <div className="space-y-2">
            <span className="text-sm font-semibold">Payment</span>
            <PaymentMethodField
              value={paymentMethod}
              checkNumber={checkNumber}
              onChange={setPaymentMethod}
              onCheckNumberChange={setCheckNumber}
              hasAccount={customerId != null}
            />
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="tk-notes"
              className="text-[11px] uppercase tracking-wider text-muted-foreground"
            >
              Notes
            </Label>
            <Textarea
              id="tk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="space-y-2 border-t bg-muted/30 px-5 py-4">
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          {completionBlockers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              To complete: {completionBlockers.join(' · ')}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="font-mono text-2xl font-bold tabular-nums">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => handleSave(false)}
              >
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                type="button"
                disabled={saving || completionBlockers.length > 0}
                onClick={() => handleSave(true)}
                title="⌘⏎"
              >
                {saving ? 'Saving…' : 'Complete ticket'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
