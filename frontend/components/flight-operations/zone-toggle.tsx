'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDisplayZone } from '@/hooks/use-display-zone'
import { cn } from '@/lib/utils'

// Board time-zone control: a button labelled with where it switches to ('Z' while on local time, 'Local'
// while on Zulu; Zulu is a per-user view preference) plus a badge that always
// says which zone the times are in, so nobody mistakes Zulu for local.
export function ZoneToggle() {
  const { isZulu, setZulu, banner } = useDisplayZone()
  const title = isZulu
    ? 'Showing Zulu (UTC). Switch back to the FBO time zone'
    : 'Showing FBO local time. Switch to Zulu (UTC)'
  return (
    <div className="flex items-center gap-2">
      <Badge
        data-testid="zone-banner"
        variant="outline"
        className={cn(
          'h-7 whitespace-nowrap font-mono text-xs',
          isZulu && 'border-amber-500 bg-amber-500/15 font-bold text-amber-600 dark:text-amber-400'
        )}
      >
        {banner}
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
