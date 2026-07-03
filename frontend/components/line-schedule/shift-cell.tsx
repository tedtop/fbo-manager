'use client'

import { cn } from '@/lib/utils'

interface ShiftCellProps {
  count: number
  covered: boolean
  onClick: () => void
}

function coverageColor(count: number): string {
  if (count === 0) return 'bg-neutral-800 hover:bg-neutral-700'
  if (count === 1) return 'bg-red-900/70 hover:bg-red-800/80'
  if (count === 2) return 'bg-yellow-900/70 hover:bg-yellow-800/80'
  return 'bg-green-900/70 hover:bg-green-800/80'
}

export function ShiftCell({ count, covered, onClick }: ShiftCellProps) {
  return (
    <button
      onClick={onClick}
      title={`${count} fueler${count !== 1 ? 's' : ''} scheduled`}
      className={cn(
        'relative h-7 w-full rounded-sm transition-colors cursor-pointer',
        coverageColor(count)
      )}
    >
      {covered && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-white/70" />
        </span>
      )}
    </button>
  )
}
