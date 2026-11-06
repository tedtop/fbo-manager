'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { cn } from '@/lib/utils'

// Board time-zone control: a button labelled with where it switches to ('Z' while on local time, 'Local'
// while on Zulu; Zulu is a per-user view preference) plus a badge that always
// says which zone the times are in, so nobody mistakes Zulu for local.
export function ZoneToggle({ className }: { className?: string }) {
  const { isZulu, setZulu, banner } = useDisplayZone()
  const title = isZulu
    ? 'Showing Zulu (UTC). Switch back to the FBO time zone'
    : 'Showing FBO local time. Switch to Zulu (UTC)'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Badge
        data-testid="zone-banner"
        variant="outline"
        className={cn(
          'hidden h-7 whitespace-nowrap font-mono text-xs sm:inline-flex',
          isZulu && 'border-amber-500 bg-amber-500/15 font-bold text-amber-600 dark:text-amber-400'
        )}
      >
        {banner}
      </Badge>
      {/* Phones: the full "Times in ..." badge is too wide, so show only the zone. */}
      <Badge
        variant="outline"
        aria-hidden
        className={cn(
          'h-7 whitespace-nowrap font-mono text-xs sm:hidden',
          isZulu && 'border-amber-500 bg-amber-500/15 font-bold text-amber-600 dark:text-amber-400'
        )}
      >
        {isZulu ? 'ZULU' : banner.replace('Times in ', '')}
      </Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setZulu(!isZulu)}
        className="h-9 min-w-[3.5rem] bg-transparent px-3 font-mono"
        title={title}
        aria-label={isZulu ? 'Zulu time on. Switch to local time' : 'Local time. Switch to Zulu time'}
        data-testid="zulu-toggle"
      >
        {isZulu ? 'Local' : 'Z'}
      </Button>
    </div>
  )
}
