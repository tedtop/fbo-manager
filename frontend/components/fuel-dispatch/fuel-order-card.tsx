'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TransactionWithRelations } from '@/repositories/transactions.repo'
import { format } from 'date-fns'
import { Fuel, Pencil, Trash2, Truck, User } from 'lucide-react'

interface FuelOrderCardProps {
  transaction: TransactionWithRelations
  onEdit: (tx: TransactionWithRelations) => void
  onDelete: (id: number) => void
  onAssignFuelers: (tx: TransactionWithRelations) => void
  onUpdateProgress: (id: number, progress: 'started' | 'in_progress' | 'completed') => void
}

const progressConfig = {
  started: { label: 'Started', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  completed: { label: 'Completed', color: 'bg-green-500/10 text-green-500 border-green-500/20' }
}

export function FuelOrderCard({
  transaction,
  onEdit,
  onDelete,
  onAssignFuelers,
  onUpdateProgress
}: FuelOrderCardProps) {
  const progress = progressConfig[transaction.progress]
  const fuelerNames = transaction.fueler_assignments
    .map((a) => a.fueler?.fueler_name)
    .filter(Boolean)
    .join(', ')

  return (
    <Card
      className={cn(
        'bg-card border-border hover:border-primary/20 transition-all',
        transaction.progress === 'completed' && 'opacity-70'
      )}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-bold text-foreground">
              {transaction.tail_number ?? `Ticket #${transaction.ticket_number}`}
            </span>
          </div>
          <Badge className={cn('text-xs font-medium px-2 py-0.5', progress.color)}>
            {progress.label}
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
              {transaction.flight.call_sign ?? transaction.flight.aircraft_id}
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
            {Number(transaction.quantity_gallons).toLocaleString()}
          </span>
          {transaction.fuel_type && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {transaction.fuel_type === 'jet_a' ? 'Jet A' : 'Avgas'}
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
          {transaction.progress !== 'completed' && (
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
          {transaction.progress === 'started' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateProgress(transaction.id, 'in_progress')}
              className="h-6 text-xs flex-1"
            >
              Start
            </Button>
          )}
          {transaction.progress === 'in_progress' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateProgress(transaction.id, 'completed')}
              className="h-6 text-xs flex-1 text-green-500"
            >
              Complete
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
