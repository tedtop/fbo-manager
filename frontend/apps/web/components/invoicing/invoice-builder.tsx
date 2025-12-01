"use client"

import { Button } from "@frontend/ui/components/ui/button"
import { Input } from "@frontend/ui/components/ui/input"
import { Separator } from "@frontend/ui/components/ui/separator"
import { Plus, Minus, CreditCard } from "lucide-react"
import type { CartItem } from "./types"

interface InvoiceBuilderProps {
    cart: CartItem[]
    onUpdateQuantity: (id: string, quantity: number) => void
}

export function InvoiceBuilder({ cart, onUpdateQuantity }: InvoiceBuilderProps) {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const tax = subtotal * 0.0 // Mock tax
    const total = subtotal + tax

    if (cart.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <p>No items in invoice</p>
                <p className="text-sm">Select products from the grid</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 space-y-4">
                {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 bg-background p-3 rounded-lg border">
                        <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-sm text-muted-foreground">${item.price.toFixed(2)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                            >
                                <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
                                className="w-16 h-8 text-center"
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                        <div className="w-20 text-right font-bold">
                            ${(item.price * item.quantity).toFixed(2)}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-auto pt-4 space-y-4">
                <Separator />
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span>Tax (0%)</span>
                        <span>${tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold">
                        <span>Total</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                </div>
                <Button className="w-full" size="lg">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Process Payment
                </Button>
            </div>
        </div>
    )
}
