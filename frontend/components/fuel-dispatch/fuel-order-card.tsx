'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FUEL_TYPE_LABELS, fromTransactionFuelType } from '@/lib/fuel-types'
import { isOpenFuelOrder, type FuelOrderStatus } from '@/lib/fuel-orders'
import { cn } from '@/lib/utils'
import type { TransactionWithRelations } from '@/repositories/transactions.repo'
import { format } from 'date-fns'
import { Fuel, Pencil, Trash2, Truck, User } from 'lucide-react'

interface FuelOrderCardProps {
  transaction: TransactionWithRelations
  onEdit: (tx: TransactionWithRelations) => void
  onDelete: (id: number) => void
  onAssignFuelers: (tx: TransactionWithRelations) => void
  onUpdateStatus: (tx: TransactionWithRelations, action: 'start' | 'fill') => void
}

const statusConfig: Record<FuelOrderStatus, { label: string; color: string }> = {
  requested: { label: 'Requested', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  assigned: { label: 'Assigned', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20' },
  fueling: { label: 'Fueling', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20' },
  filled: { label: 'Filled', color: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground border-border' }
}

export function FuelOrderCard({
  transaction,
  onEdit,
  onDelete,
  onAssignFuelers,
  onUpdateStatus
}: FuelOrderCardProps) {
  const status = statusConfig[transaction.status]
  const fuelerNames = transaction.fueler_assignments
    .map((a) => a.fueler?.fueler_name)
    .filter(Boolean)
    .join(', ')

  return (
    <Card
      className={cn(
        'bg-card border-border hover:border-primary/20 transition-all',
        (transaction.status === 'filled' || transaction.status === 'cancelled') && 'opacity-70'
      )}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-bold text-foreground">
              {transaction.tail_number ?? `Ticket #${transaction.ticket_number}`}
            </span>
          </div>
          <Badge className={cn('text-xs font-medium px-2 py-0.5', status.color)}>
            {status.label}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Ticket:</span>
          <span className="font-mono text-foreground">{transaction.ticket_number}</span>
        </div>

        {transaction.flight && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Flight:</span>
            <span className="font-mono text-foreground">
              {transaction.flight.call_sign ?? transaction.flight.tail_number}
            </span>
          </div>
        )}

        {transaction.fuel_truck && (
          <div className="flex items-center gap-2 text-xs">
            <Truck className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Truck:</span>
            <span className="text-foreground">{transaction.fuel_truck.equipment_id}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Gallons:</span>
          <span className="font-semibold text-foreground">
            {Number(transaction.gallons_delivered ?? transaction.quantity_gallons).toLocaleString()}
          </span>
          {transaction.fuel_type && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {FUEL_TYPE_LABELS[fromTransactionFuelType(transaction.fuel_type) ?? 'jet_a']}
            </Badge>
          )}
        </div>

        {fuelerNames && (
          <div className="flex items-center gap-2 text-xs">
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Fuelers:</span>
            <span className="text-foreground">{fuelerNames}</span>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {format(new Date(transaction.created_at), 'MMM d, HH:mm')}
        </div>

        <div className="flex gap-1 pt-1 border-t border-border">
          {isOpenFuelOrder(transaction.status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAssignFuelers(transaction)}
              className="h-6 text-xs flex-1"
            >
              <User className="w-3 h-3 mr-1" />
              Assign
            </Button>
          )}
          {transaction.status === 'assigned' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateStatus(transaction, 'start')}
              className="h-6 text-xs flex-1"
            >
              Start
            </Button>
          )}
          {isOpenFuelOrder(transaction.status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateStatus(transaction, 'fill')}
              className="h-6 text-xs flex-1 text-green-700 dark:text-green-400"
            >
              Fill
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(transaction)}
            className="h-6 text-xs"
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(transaction.id)}
            className="h-6 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
