import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Placeholder shaped like a FlightCard. The body is also used as the overlay a card fades into
// while it is being deleted, so it fills its parent's height when one is set.
export function FlightCardSkeletonBody({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full flex-col gap-1.5 p-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex gap-1 border-t border-border pt-1.5">
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-6 flex-1" />
      </div>
    </div>
  )
}

export function FlightCardSkeleton({
  className,
  style
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <Card className={cn('bg-card border-border', className)} style={style}>
      <FlightCardSkeletonBody />
    </Card>
  )
}
