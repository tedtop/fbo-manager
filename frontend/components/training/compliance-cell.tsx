'use client'

import { cn } from '@/lib/utils'
import type { CellState, ComplianceStatus } from '@/services/training.service'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, CheckCircle2, Plus, XCircle } from 'lucide-react'

interface ComplianceCellProps {
  cell: CellState
  onClick: () => void
}

const CELL_STYLES: Record<ComplianceStatus, string> = {
  current: 'bg-success/10 text-success hover:bg-success/20 border-success/20',
  expiring: 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/20',
  expired:
    'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20',
  missing:
    'bg-muted/40 text-muted-foreground hover:bg-muted border-transparent border-dashed'
}

export function ComplianceCell({ cell, onClick }: ComplianceCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md border text-xs font-medium transition-colors',
        CELL_STYLES[cell.status]
      )}
    >
      {cell.status === 'missing' ? (
        <Plus className="size-4 opacity-50 group-hover:opacity-100" />
      ) : (
        <>
          <span className="flex items-center gap-1">
            {cell.status === 'current' && <CheckCircle2 className="size-3" />}
            {cell.status === 'expiring' && <AlertTriangle className="size-3" />}
            {cell.status === 'expired' && <XCircle className="size-3" />}
            {cell.latest?.completed_on
              ? format(parseISO(cell.latest.completed_on), 'M/d/yy')
              : ''}
          </span>
          {cell.status !== 'current' && cell.daysUntilExpiry != null && (
            <span className="text-[10px] opacity-80">
              {cell.daysUntilExpiry < 0
                ? `${Math.abs(cell.daysUntilExpiry)}d overdue`
                : `${cell.daysUntilExpiry}d left`}
            </span>
          )}
        </>
      )}
    </button>
  )
}
