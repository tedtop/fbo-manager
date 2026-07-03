"use client"

import * as React from "react"
import { format } from "date-fns"
import { Search, RefreshCw, Receipt } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useInvoices, useUpdateInvoice } from "@/hooks/use-invoices"
import type { InvoiceRow, InvoiceWithRelations } from "@/repositories/invoices.repo"

const STATUS_LABELS: Record<InvoiceRow["status"], string> = {
    draft:  "Draft",
    issued: "Issued",
    paid:   "Paid",
    void:   "Void",
}

const STATUS_VARIANTS: Record<InvoiceRow["status"], "secondary" | "default" | "outline" | "destructive"> = {
    draft:  "secondary",
    issued: "default",
    paid:   "outline",
    void:   "destructive",
}

const PAYMENT_LABELS: Record<string, string> = {
    cash:        "Cash",
    credit_card: "Card",
    check:       "Check",
    account:     "Account",
}

export function InvoiceList() {
    const [search, setSearch]       = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<InvoiceRow["status"] | "all">("all")
    const [selected, setSelected]   = React.useState<InvoiceWithRelations | null>(null)

    const { data: invoices = [], isLoading, refetch } = useInvoices(
        statusFilter !== "all" ? { status: statusFilter } : undefined
    )
    const updateInvoice = useUpdateInvoice()

    const filtered = React.useMemo(() => {
        if (!search.trim()) return invoices
        const term = search.toLowerCase()
        return invoices.filter(
            (inv) =>
                inv.customer?.name.toLowerCase().includes(term) ||
                inv.id.toString().includes(term)
        )
    }, [invoices, search])

    const markPaid = async (inv: InvoiceWithRelations) => {
        await updateInvoice.mutateAsync({
            id: inv.id,
            updates: {
                status: "paid",
                payment_recorded_at: new Date().toISOString(),
            },
        })
        setSelected(null)
    }

    const voidInvoice = async (inv: InvoiceWithRelations) => {
        await updateInvoice.mutateAsync({ id: inv.id, updates: { status: "void" } })
        setSelected(null)
    }

    return (
        <div className="h-full flex flex-col p-6 gap-4">
            <div className="flex gap-3 items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search by customer or invoice #..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="issued">Issued</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-md border">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    Loading invoices...
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    No invoices found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((inv) => (
                                <TableRow
                                    key={inv.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => setSelected(inv)}
                                >
                                    <TableCell className="font-mono text-sm">{inv.id}</TableCell>
                                    <TableCell className="font-medium">{inv.customer?.name ?? "—"}</TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {format(new Date(inv.created_at), "MMM d, yyyy")}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        ${Number(inv.total_amount).toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {inv.payment_method ? PAYMENT_LABELS[inv.payment_method] : "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANTS[inv.status]}>
                                            {STATUS_LABELS[inv.status]}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
                {selected && (
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                                Invoice #{selected.id}
                                <Badge variant={STATUS_VARIANTS[selected.status]}>
                                    {STATUS_LABELS[selected.status]}
                                </Badge>
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Customer</p>
                                    <p className="font-medium">{selected.customer?.name ?? "—"}</p>
                                    {selected.customer?.email && (
                                        <p className="text-muted-foreground text-xs">{selected.customer.email}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Date</p>
                                    <p className="font-medium">
                                        {format(new Date(selected.created_at), "MMM d, yyyy")}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Payment Method</p>
                                    <p className="font-medium">
                                        {selected.payment_method ? PAYMENT_LABELS[selected.payment_method] : "—"}
                                    </p>
                                </div>
                                {selected.payment_recorded_at && (
                                    <div>
                                        <p className="text-muted-foreground">Paid At</p>
                                        <p className="font-medium">
                                            {format(new Date(selected.payment_recorded_at), "MMM d, h:mm a")}
                                        </p>
                                    </div>
                                )}
                            </div>
                            {selected.notes && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Notes</p>
                                    <p className="text-sm">{selected.notes}</p>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total</span>
                                <span>${Number(selected.total_amount).toFixed(2)}</span>
                            </div>
                        </div>
                        {selected.status === "issued" && (
                            <div className="flex gap-2 pt-2">
                                <Button className="flex-1" onClick={() => markPaid(selected)}>
                                    Mark as Paid
                                </Button>
                                <Button variant="outline" onClick={() => voidInvoice(selected)}>
                                    Void
                                </Button>
                            </div>
                        )}
                        {selected.status === "draft" && (
                            <div className="flex gap-2 pt-2">
                                <Button
                                    className="flex-1"
                                    onClick={() => updateInvoice.mutateAsync({
                                        id: selected.id,
                                        updates: { status: "issued" }
                                    }).then(() => setSelected(null))}
                                >
                                    Issue Invoice
                                </Button>
                                <Button variant="outline" onClick={() => voidInvoice(selected)}>
                                    Void
                                </Button>
                            </div>
                        )}
                    </DialogContent>
                )}
            </Dialog>
        </div>
    )
}
