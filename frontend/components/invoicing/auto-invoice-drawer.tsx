"use client"

import * as React from "react"
import { Loader2, Plane, Fuel, Wrench, ChevronsUpDown, Check } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { findAllFlights } from "@/repositories/flights.repo"
import { useCustomers } from "@/hooks/use-customers"
import { useCreateInvoice } from "@/hooks/use-invoices"
import { CustomerSelector } from "./customer-selector"
import { useToast } from "@/hooks/use-toast"
import type { CustomerRow } from "@/repositories/customers.repo"
import type { FlightWithRelations } from "@/repositories/flights.repo"
import type { InvoiceRow } from "@/repositories/invoices.repo"

type PaymentMethod = NonNullable<InvoiceRow["payment_method"]>

type LineItem = {
    key: string
    description: string
    quantity: number
    unit_price: number
}

const SERVICE_PRICES: Record<string, number> = {
    "GPU Start":        75.00,
    "Lav Service":      125.00,
    "Catering":         50.00,
    "Catering Handling": 50.00,
    "Overnight Parking": 150.00,
    "Water Service":    45.00,
    "Stairs":           35.00,
}

export function AutoInvoiceDrawer() {
    const db = createClient()
    const { toast } = useToast()

    const [flightOpen, setFlightOpen] = React.useState(false)
    const [selectedFlight, setSelectedFlight] = React.useState<FlightWithRelations | null>(null)
    const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerRow | null>(null)
    const [lineItems, setLineItems] = React.useState<LineItem[]>([])
    const [notes, setNotes] = React.useState("")
    const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | "">("")
    const [saved, setSaved] = React.useState(false)

    const { data: flights = [], isLoading: flightsLoading } = useQuery({
        queryKey: ["flights", "for-invoice"],
        queryFn:  () => findAllFlights(db, { today: false }),
    })

    const { data: fuelTxns = [], isLoading: fuelLoading } = useQuery({
        queryKey: ["fuel-transactions", "flight", selectedFlight?.id],
        queryFn: async () => {
            if (!selectedFlight) return []
            const { data, error } = await db
                .from("fuel_transaction")
                .select("*")
                .eq("flight_id", selectedFlight.id)
                .eq("progress", "completed")
            if (error) throw error
            return data ?? []
        },
        enabled: !!selectedFlight,
    })

    const createInvoice = useCreateInvoice()

    const handleFlightSelect = (flight: FlightWithRelations) => {
        setSelectedFlight(flight)
        setFlightOpen(false)
        setSaved(false)

        const items: LineItem[] = []

        // Add fuel line items from completed transactions
        for (const txn of fuelTxns) {
            const gallons = txn.quantity_gallons ? Number.parseFloat(txn.quantity_gallons) : 0
            if (gallons > 0) {
                items.push({
                    key:         `fuel-${txn.id}`,
                    description: "Jet A Fuel",
                    quantity:    gallons,
                    unit_price:  6.45,
                })
            }
        }

        // Add flight services
        for (const svc of flight.services ?? []) {
            items.push({
                key:         `svc-${svc}`,
                description: svc,
                quantity:    1,
                unit_price:  SERVICE_PRICES[svc] ?? 0,
            })
        }

        if (items.length === 0) {
            items.push({ key: "custom-1", description: "", quantity: 1, unit_price: 0 })
        }

        setLineItems(items)
    }

    // Re-populate fuel items when txns load for an already-selected flight
    React.useEffect(() => {
        if (!selectedFlight || fuelTxns.length === 0) return
        setLineItems((prev) => {
            const hasFuel = prev.some((i) => i.key.startsWith("fuel-"))
            if (hasFuel) return prev
            const fuelItems = fuelTxns
                .filter((t) => (t.quantity_gallons ? Number.parseFloat(t.quantity_gallons) : 0) > 0)
                .map((t) => ({
                    key:         `fuel-${t.id}`,
                    description: "Jet A Fuel",
                    quantity:    t.quantity_gallons ? Number.parseFloat(t.quantity_gallons) : 0,
                    unit_price:  6.45,
                }))
            return [...fuelItems, ...prev]
        })
    }, [fuelTxns, selectedFlight])

    const updateItem = (key: string, field: keyof LineItem, value: string | number) => {
        setLineItems((prev) =>
            prev.map((item) => item.key === key ? { ...item, [field]: value } : item)
        )
    }

    const removeItem = (key: string) =>
        setLineItems((prev) => prev.filter((i) => i.key !== key))

    const addItem = () =>
        setLineItems((prev) => [
            ...prev,
            { key: `custom-${Date.now()}`, description: "", quantity: 1, unit_price: 0 },
        ])

    const total = lineItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)

    const handleSave = async (status: InvoiceRow["status"]) => {
        if (!selectedCustomer) {
            toast({ title: "Select a customer", variant: "destructive" })
            return
        }
        if (lineItems.length === 0) {
            toast({ title: "Add at least one line item", variant: "destructive" })
            return
        }

        await createInvoice.mutateAsync({
            invoice: {
                customer_id:          selectedCustomer.id,
                flight_id:            selectedFlight?.id ?? null,
                status,
                total_amount:         total.toFixed(2),
                payment_method:       paymentMethod || null,
                notes,
                payment_recorded_at:  status === "paid" && paymentMethod ? new Date().toISOString() : null,
            },
            items: lineItems.map((i) => ({
                description: i.description,
                quantity:    i.quantity,
                unit_price:  i.unit_price.toFixed(2),
                total_price: (i.quantity * i.unit_price).toFixed(2),
            })),
        })

        toast({ title: `Invoice ${status === "draft" ? "saved as draft" : "issued"} successfully` })
        setSaved(true)
        setSelectedFlight(null)
        setSelectedCustomer(null)
        setLineItems([])
        setNotes("")
        setPaymentMethod("")
    }

    const tailNumber = selectedFlight?.aircraft_id ?? ""

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="space-y-2">
                    <Label>Select Flight</Label>
                    <Popover open={flightOpen} onOpenChange={setFlightOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full justify-between">
                                {selectedFlight ? (
                                    <span className="flex items-center gap-2">
                                        <Plane className="h-4 w-4" />
                                        {selectedFlight.aircraft_id}
                                        {selectedFlight.aircraft?.aircraft_type_display && (
                                            <span className="text-muted-foreground text-xs">
                                                ({selectedFlight.aircraft.aircraft_type_display})
                                            </span>
                                        )}
                                        <span className="text-muted-foreground text-xs ml-auto">
                                            {format(new Date(selectedFlight.departure_time), "MMM d")}
                                        </span>
                                    </span>
                                ) : flightsLoading ? (
                                    <span className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading flights...
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">Pick a flight to auto-populate...</span>
                                )}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[480px] p-0">
                            <Command>
                                <CommandInput placeholder="Search by tail or date..." />
                                <CommandList className="max-h-64">
                                    <CommandEmpty>No flights found.</CommandEmpty>
                                    <CommandGroup>
                                        {flights.slice(0, 50).map((flight) => (
                                            <CommandItem
                                                key={flight.id}
                                                value={`${flight.aircraft_id} ${flight.departure_time}`}
                                                onSelect={() => handleFlightSelect(flight)}
                                            >
                                                <Check
                                                    className={`mr-2 h-4 w-4 ${selectedFlight?.id === flight.id ? "opacity-100" : "opacity-0"}`}
                                                />
                                                <Plane className="mr-2 h-4 w-4 text-muted-foreground" />
                                                <span className="font-mono font-medium mr-2">{flight.aircraft_id}</span>
                                                <span className="text-muted-foreground text-sm flex-1">
                                                    {flight.contact_name || "No contact"}
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    {format(new Date(flight.departure_time), "MMM d, h:mm a")}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {selectedFlight && (
                    <>
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
                            <div className="flex gap-4">
                                <span className="text-muted-foreground w-24">Tail</span>
                                <span className="font-mono font-medium">{tailNumber}</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-muted-foreground w-24">Contact</span>
                                <span>{selectedFlight.contact_name || "—"}</span>
                            </div>
                            <div className="flex gap-4">
                                <span className="text-muted-foreground w-24">Departure</span>
                                <span>{format(new Date(selectedFlight.departure_time), "MMM d, h:mm a")}</span>
                            </div>
                            {fuelLoading && (
                                <div className="flex items-center gap-2 text-muted-foreground pt-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span className="text-xs">Loading fuel transactions...</span>
                                </div>
                            )}
                        </div>

                        <CustomerSelector selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Line Items</Label>
                                <Button variant="ghost" size="sm" onClick={addItem}>+ Add Item</Button>
                            </div>
                            {lineItems.map((item) => (
                                <div key={item.key} className="flex gap-2 items-center">
                                    <Input
                                        className="flex-1"
                                        placeholder="Description"
                                        value={item.description}
                                        onChange={(e) => updateItem(item.key, "description", e.target.value)}
                                    />
                                    <Input
                                        className="w-20 text-center"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        placeholder="Qty"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(item.key, "quantity", Number(e.target.value) || 0)}
                                    />
                                    <Input
                                        className="w-24 text-right"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="$/unit"
                                        value={item.unit_price}
                                        onChange={(e) => updateItem(item.key, "unit_price", Number(e.target.value) || 0)}
                                    />
                                    <span className="w-24 text-right text-sm font-mono font-medium">
                                        ${(item.quantity * item.unit_price).toFixed(2)}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground hover:text-destructive px-2"
                                        onClick={() => removeItem(item.key)}
                                    >
                                        ✕
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea
                                placeholder="Internal notes or customer-facing comments..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="space-y-3">
                            <Label>Payment Method</Label>
                            <RadioGroup
                                value={paymentMethod}
                                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                                className="flex gap-6"
                            >
                                {(["cash", "credit_card", "check", "account"] as const).map((m) => (
                                    <div key={m} className="flex items-center space-x-2">
                                        <RadioGroupItem value={m} id={`auto-pm-${m}`} />
                                        <Label htmlFor={`auto-pm-${m}`} className="font-normal capitalize cursor-pointer">
                                            {m === "credit_card" ? "Card" : m === "account" ? "Charge to Account" : m.charAt(0).toUpperCase() + m.slice(1)}
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>

                        <Separator />

                        <div className="flex justify-between items-center text-xl font-bold">
                            <span>Total</span>
                            <span>${total.toFixed(2)}</span>
                        </div>

                        <div className="flex gap-3 pb-6">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => handleSave("draft")}
                                disabled={createInvoice.isPending}
                            >
                                Save Draft
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={() => handleSave("issued")}
                                disabled={createInvoice.isPending || !selectedCustomer}
                            >
                                {createInvoice.isPending ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                                ) : "Issue Invoice"}
                            </Button>
                        </div>
                    </>
                )}

                {!selectedFlight && !saved && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Plane className="h-12 w-12 opacity-20" />
                        <p className="text-sm">Select a flight above to auto-populate fuel and services.</p>
                    </div>
                )}

                {saved && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <p className="text-green-600 font-medium">Invoice saved successfully.</p>
                        <Button variant="outline" onClick={() => setSaved(false)}>Create Another</Button>
                    </div>
                )}
            </div>
        </div>
    )
}
