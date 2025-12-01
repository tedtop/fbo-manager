"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@frontend/ui/components/ui/card"
import { Badge } from "@frontend/ui/components/ui/badge"
import { Fuel, Wrench, FileText, ShoppingBag } from "lucide-react"
import type { Product } from "./types"

const MOCK_PRODUCTS: Product[] = [
    { id: "1", name: "Jet A", price: 6.45, type: "fuel", description: "Per Gallon" },
    { id: "2", name: "100LL", price: 7.15, type: "fuel", description: "Per Gallon" },
    { id: "3", name: "Overnight Parking (Jet)", price: 150.00, type: "fee" },
    { id: "4", name: "Overnight Parking (Single)", price: 25.00, type: "fee" },
    { id: "5", name: "GPU Start", price: 75.00, type: "service" },
    { id: "6", name: "Lav Service", price: 125.00, type: "service" },
    { id: "7", name: "Catering Handling", price: 50.00, type: "fee" },
    { id: "8", name: "Oil (Qt)", price: 12.50, type: "product" },
]

interface ProductGridProps {
    onAddToCart: (product: Product) => void
}

export function ProductGrid({ onAddToCart }: ProductGridProps) {
    const getIcon = (type: Product["type"]) => {
        switch (type) {
            case "fuel": return <Fuel className="h-4 w-4" />
            case "service": return <Wrench className="h-4 w-4" />
            case "fee": return <FileText className="h-4 w-4" />
            default: return <ShoppingBag className="h-4 w-4" />
        }
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {MOCK_PRODUCTS.map((product) => (
                <Card
                    key={product.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => onAddToCart(product)}
                >
                    <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start">
                            <Badge variant="outline" className="capitalize flex gap-1 items-center">
                                {getIcon(product.type)}
                                {product.type}
                            </Badge>
                        </div>
                        <CardTitle className="text-lg mt-2">{product.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <p className="text-2xl font-bold">${product.price.toFixed(2)}</p>
                        {product.description && (
                            <p className="text-sm text-muted-foreground">{product.description}</p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
