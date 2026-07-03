'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import type {
  InvoiceFilters,
  InvoiceStatus,
  InvoiceWithItems
} from '@/repositories/invoices.repo'
import { format } from 'date-fns'
import { Fuel, MoreHorizontal, Search, Wrench } from 'lucide-react'
import { formatCurrency } from './ticket-math'
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from './types'

interface InvoiceListProps {
  invoices: InvoiceWithItems[]
  loading: boolean
  filters: InvoiceFilters
  onFiltersChange: (filters: InvoiceFilters) => void
  onOpen: (invoice: InvoiceWithItems) => void
  onEditDraft: (invoice: InvoiceWithItems) => void
  onSettle: (invoice: InvoiceWithItems) => void
  onVoid: (invoice: InvoiceWithItems) => void
  onDeleteDraft: (invoice: InvoiceWithItems) => void
}

const STATUS_FILTERS: Array<{ value: InvoiceStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'On account' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' }
]

export function InvoiceList({
  invoices,
  loading,
  filters,
  onFiltersChange,
  onOpen,
  onEditDraft,
  onSettle,
  onVoid,
  onDeleteDraft
}: InvoiceListProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search ?? ''}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value })
            }
            placeholder="Search ticket #, customer, or tail number…"
            className="pl-8"
          />
        </div>
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, status: v as InvoiceStatus | 'all' })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Ticket #</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="w-24">Tail #</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Loading tickets…
                </TableCell>
              </TableRow>
            )}
            {!loading && invoices.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No tickets match this search.
                </TableCell>
              </TableRow>
            )}
            {invoices.map((invoice) => {
              const hasFuel = invoice.line_items.some(
                (li) => li.item_type === 'fuel'
              )
              return (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(invoice)}
                >
                  <TableCell className="font-mono font-medium tabular-nums">
                    {invoice.invoice_number}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(invoice.invoice_date), 'MM/dd/yy')}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {invoice.customer_name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {invoice.tail_number ?? '—'}
                  </TableCell>
                  <TableCell>
                    {hasFuel ? (
                      <Fuel
                        className="h-4 w-4 text-primary"
                        aria-label="Fuel ticket"
                      />
                    ) : (
                      <Wrench
                        className="h-4 w-4 text-muted-foreground"
                        aria-label="Service ticket"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE_CLASSES[invoice.status]}
                    >
                      {STATUS_LABELS[invoice.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(invoice)}>
                          View / print
                        </DropdownMenuItem>
                        {invoice.status === 'draft' && (
                          <>
                            <DropdownMenuItem
                              onClick={() => onEditDraft(invoice)}
                            >
                              Continue editing
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDeleteDraft(invoice)}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete draft
                            </DropdownMenuItem>
                          </>
                        )}
                        {invoice.status === 'open' && (
                          <DropdownMenuItem onClick={() => onSettle(invoice)}>
                            Record settlement
                          </DropdownMenuItem>
                        )}
                        {(invoice.status === 'open' ||
                          invoice.status === 'paid') && (
                          <DropdownMenuItem
                            onClick={() => onVoid(invoice)}
                            className="text-destructive focus:text-destructive"
                          >
                            Void
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
