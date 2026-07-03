"use client"

import * as React from "react"
import { Loader2, Plus, Minus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { CustomerSelector } from "./customer-selector"
import { ProductGrid } from "./product-grid"
import { useCreateInvoice } from "@/hooks/use-invoices"
import { useToast } from "@/hooks/use-toast"
import type { CustomerRow } from "@/repositories/customers.repo"
import type { ProductRow } from "@/repositories/products.repo"
import type { InvoiceRow } from "@/repositories/invoices.repo"

type PaymentMethod = NonNullable<InvoiceRow["payment_method"]>

type CartItem = {
    key: string
    description: string
    quantity: number
    unit_price: number
    product_id?: number
}

function productToCartItem(product: ProductRow): CartItem {
    return {
        key:        `product-${product.id}-${Date.now()}`,
        description: product.name,
        quantity:    1,
        unit_price:  Number(product.price),
        product_id:  product.id,
    }
}

export function InvoiceForm() {
    const { toast } = useToast()
    const createInvoice = useCreateInvoice()

    const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerRow | null>(null)
    const [tailNumber, setTailNumber]             = React.useState("")
    const [cart, setCart]                         = React.useState<CartItem[]>([])
    const [customDesc, setCustomDesc]             = React.useState("")
    const [customQty, setCustomQty]               = React.useState("1")
    const [customPrice, setCustomPrice]           = React.useState("")
    const [notes, setNotes]                       = React.useState("")
    const [paymentMethod, setPaymentMethod]       = React.useState<PaymentMethod | "">("")

    const addToCart = (product: ProductRow) => {
        setCart((prev) => {
            const existing = prev.find((i) => i.product_id === product.id)
            if (existing) {
                return prev.map((i) =>
                    i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
                )
            }
            return [...prev, productToCartItem(product)]
        })
    }

    const updateQuantity = (key: string, qty: number) => {
        if (qty <= 0) {
            setCart((prev) => prev.filter((i) => i.key !== key))
            return
        }
        setCart((prev) => prev.map((i) => i.key === key ? { ...i, quantity: qty } : i))
    }

    const removeItem = (key: string) => setCart((prev) => prev.filter((i) => i.key !== key))

    const addCustomItem = () => {
        const qty   = Number.parseFloat(customQty) || 1
        const price = Number.parseFloat(customPrice) || 0
        if (!customDesc.trim()) return
        setCart((prev) => [...prev, {
            key:         `custom-${Date.now()}`,
            description: customDesc.trim(),
            quantity:    qty,
            unit_price:  price,
        }])
        setCustomDesc("")
        setCustomQty("1")
        setCustomPrice("")
    }

    const total = cart.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)

    const reset = () => {
        setSelectedCustomer(null)
        setTailNumber("")
        setCart([])
        setNotes("")
        setPaymentMethod("")
    }

    const handleSave = async (status: InvoiceRow["status"]) => {
        if (!selectedCustomer) {
            toast({ title: "Select a customer before saving.", variant: "destructive" })
            return
        }
        if (cart.length === 0) {
            toast({ title: "Add at least one line item.", variant: "destructive" })
            return
        }

        await createInvoice.mutateAsync({
            invoice: {
                customer_id:         selectedCustomer.id,
                status,
                total_amount:        total.toFixed(2),
                payment_method:      paymentMethod || null,
                notes:               [tailNumber ? `Aircraft: ${tailNumber}` : "", notes].filter(Boolean).join("\n"),
                payment_recorded_at: status === "paid" && paymentMethod ? new Date().toISOString() : null,
            },
            items: cart.map((i) => ({
                description: i.description,
                quantity:    i.quantity,
                unit_price:  i.unit_price.toFixed(2),
                total_price: (i.quantity * i.unit_price).toFixed(2),
                product_id:  i.product_id ?? null,
            })),
        })

        toast({ title: status === "draft" ? "Invoice saved as draft." : "Invoice issued successfully." })
        reset()
    }

    return (
        <div className="h-full overflow-hidden">
            <ResizablePanelGroup direction="horizontal" id="invoice-form-group">
                {/* Left: product catalog */}
                <ResizablePanel defaultSize={60} minSize={40} id="invoice-products" order={1}>
                    <div className="h-full p-6 overflow-y-auto">
                        <h2 className="text-xl font-semibold mb-4">Products & Services</h2>
                        <ProductGrid onAddToCart={addToCart} />

                        <div className="mt-6 space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Custom Line Item</h3>
                            <div className="flex gap-2">
                                <Input
                                    className="flex-1"
                                    placeholder="Description"
                                    value={customDesc}
                                    onChange={(e) => setCustomDesc(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
                                />
                                <Input
                                    className="w-20 text-center"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="Qty"
                                    value={customQty}
                                    onChange={(e) => setCustomQty(e.target.value)}
                                />
                                <Input
                                    className="w-24 text-right"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="$/unit"
                                    value={customPrice}
                                    onChange={(e) => setCustomPrice(e.target.value)}
                                />
                                <Button variant="outline" size="icon" onClick={addCustomItem}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle />

                {/* Right: invoice builder */}
                <ResizablePanel defaultSize={40} minSize={30} id="invoice-builder" order={2}>
                    <div className="h-full flex flex-col border-l bg-muted/10">
                        {/* Customer + tail */}
                        <div className="p-4 border-b space-y-3">
                            <CustomerSelector
                                selectedCustomer={selectedCustomer}
                                onSelect={setSelectedCustomer}
                            />
                            <div className="space-y-1">
                                <Label htmlFor="tail-number">Aircraft Tail</Label>
                                <Input
                                    id="tail-number"
                                    placeholder="N12345"
                                    value={tailNumber}
                                    onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                                    className="font-mono"
                                />
                            </div>
                        </div>

                        {/* Line items */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                    <p className="text-sm">No items yet.</p>
                                    <p className="text-xs">Click a product or add a custom line item.</p>
                                </div>
                            ) : (
                                cart.map((item) => (
                                    <div
                                        key={item.key}
                                        className="flex items-center gap-2 bg-background p-3 rounded-lg border"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{item.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                ${item.unit_price.toFixed(2)}/unit
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => updateQuantity(item.key, item.quantity - 1)}
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <Input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => updateQuantity(item.key, Number(e.target.value) || 0)}
                                                className="w-14 h-7 text-center text-sm"
                                            />
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => updateQuantity(item.key, item.quantity + 1)}
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <span className="w-18 text-right text-sm font-mono font-bold">
                                            ${(item.quantity * item.unit_price).toFixed(2)}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeItem(item.key)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer: notes, payment, totals, actions */}
                        <div className="p-4 border-t space-y-4">
                            <Textarea
                                placeholder="Notes (optional)"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                className="text-sm resize-none"
                            />

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                                    Payment Method
                                </Label>
                                <RadioGroup
                                    value={paymentMethod}
                                    onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                                    className="grid grid-cols-2 gap-1"
                                >
                                    {([
                                        ["cash",        "Cash"],
                                        ["credit_card", "Card"],
                                        ["check",       "Check"],
                                        ["account",     "Charge to Account"],
                                    ] as const).map(([value, label]) => (
                                        <div key={value} className="flex items-center space-x-2">
                                            <RadioGroupItem value={value} id={`pm-${value}`} />
                                            <Label htmlFor={`pm-${value}`} className="font-normal text-sm cursor-pointer">
                                                {label}
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>

                            <Separator />

                            <div className="flex justify-between text-xl font-bold">
                                <span>Total</span>
                                <span>${total.toFixed(2)}</span>
                            </div>

                            <div className="flex gap-2">
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
                        </div>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
