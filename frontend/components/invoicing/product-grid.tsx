"use client"

import { createClient } from "@/lib/supabase/client"
import { findAllProducts } from "@/repositories/products.repo"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Fuel, Wrench, FileText, ShoppingBag } from "lucide-react"
import type { ProductRow } from "@/repositories/products.repo"

export type { ProductRow }

interface ProductGridProps {
    onAddToCart: (product: ProductRow) => void
}

function getIcon(type: ProductRow["product_type"]) {
    switch (type) {
        case "fuel":    return <Fuel className="h-4 w-4" />
        case "service": return <Wrench className="h-4 w-4" />
        case "fee":     return <FileText className="h-4 w-4" />
        default:        return <ShoppingBag className="h-4 w-4" />
    }
}

export function ProductGrid({ onAddToCart }: ProductGridProps) {
    const db = createClient()
    const { data: products = [], isLoading } = useQuery({
        queryKey: ["products", "active"],
        queryFn:  () => findAllProducts(db),
    })

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                ))}
            </div>
        )
    }

    if (products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <ShoppingBag className="h-8 w-8 opacity-40" />
                <p className="text-sm">No products found.</p>
                <p className="text-xs">Add products in the admin panel to populate this grid.</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product) => (
                <Card
                    key={product.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => onAddToCart(product)}
                >
                    <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start">
                            <Badge variant="outline" className="capitalize flex gap-1 items-center text-xs">
                                {getIcon(product.product_type)}
                                {product.product_type}
                            </Badge>
                        </div>
                        <CardTitle className="text-base mt-2 leading-tight">{product.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <p className="text-xl font-bold">${Number(product.price).toFixed(2)}</p>
                        {product.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
