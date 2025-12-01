"use client"

import * as React from "react"
import { ProductGrid } from "./product-grid"
import { InvoiceBuilder } from "./invoice-builder"
import { CustomerSelector } from "./customer-selector"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@frontend/ui/components/ui/resizable"

import type { CartItem, Customer, Product } from "./types"

export function PosLayout() {
    const [cart, setCart] = React.useState<CartItem[]>([])
    const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null)

    const addToCart = (product: Product) => {
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id)
            if (existing) {
                return prev.map((item) =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                )
            }
            return [...prev, { ...product, quantity: 1 }]
        })
    }

    const updateQuantity = (id: string, quantity: number) => {
        if (quantity <= 0) {
            setCart((prev) => prev.filter((item) => item.id !== id))
            return
        }
        setCart((prev) =>
            prev.map((item) => (item.id === id ? { ...item, quantity } : item))
        )
    }

    return (
        <div className="h-[calc(100vh-4rem)] w-full overflow-hidden">
            <ResizablePanelGroup direction="horizontal" id="pos-layout-group">
                <ResizablePanel defaultSize={60} minSize={40} id="pos-products-panel" order={1}>
                    <div className="h-full p-4 overflow-y-auto">
                        <h2 className="text-2xl font-bold mb-4">Products & Services</h2>
                        <ProductGrid onAddToCart={addToCart} />
                    </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={40} minSize={30} id="pos-cart-panel" order={2}>
                    <div className="h-full flex flex-col border-l bg-muted/10">
                        <div className="p-4 border-b">
                            <CustomerSelector
                                selectedCustomer={selectedCustomer}
                                onSelect={setSelectedCustomer}
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <InvoiceBuilder
                                cart={cart}
                                onUpdateQuantity={updateQuantity}
                            />
                        </div>
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
