import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FlightEmptyStateProps {
  title: string
  // Present only when filters caused the emptiness; renders the Clear filters action.
  onClearFilters?: () => void
  className?: string
}

export function FlightEmptyState({
  title,
  onClearFilters,
  className
}: FlightEmptyStateProps) {
  return (
    <div
      data-slot="flight-empty-state"
      className={cn('py-12 text-center text-muted-foreground', className)}
    >
      <p className="break-words">{title}</p>
      {onClearFilters && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      )}
    </div>
  )
}
