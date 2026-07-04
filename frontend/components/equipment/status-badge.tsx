'use client'

import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

export type EquipmentStatus =
  | 'available'
  | 'in_use'
  | 'maintenance'
  | 'out_of_service'

const STATUS_CONFIG: Record<
  EquipmentStatus,
  { label: string; dot: string; badge: string }
> = {
  available: {
    label: 'Available',
    dot: 'bg-green-500',
    badge:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
  },
  in_use: {
    label: 'In Use',
    dot: 'bg-yellow-500',
    badge:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
  },
  maintenance: {
    label: 'Maintenance',
    dot: 'bg-yellow-500',
    badge:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
  },
  out_of_service: {
    label: 'Out of Service',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  }
}

const ALL_STATUSES: EquipmentStatus[] = [
  'available',
  'in_use',
  'maintenance',
  'out_of_service'
]

interface StatusBadgeProps {
  status: EquipmentStatus
  onStatusChange?: (status: EquipmentStatus) => void
}

export function StatusBadge({ status, onStatusChange }: StatusBadgeProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const config = STATUS_CONFIG[status]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => onStatusChange && setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity',
          config.badge,
          onStatusChange ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
        {config.label}
        {onStatusChange && <span className="opacity-50">▾</span>}
      </button>

      {open && onStatusChange && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[150px] rounded-md border border-border bg-popover shadow-md">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onStatusChange(s)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                s === status && 'font-semibold'
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full flex-shrink-0',
                  STATUS_CONFIG[s].dot
                )}
              />
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
