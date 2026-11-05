'use client'

import { flightradarUrl } from '@/components/flight-operations/board-logic'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAircraftTypeLookup } from '@/hooks/use-aircraft-type-lookup'
import { useState } from 'react'

interface TailNumberLinkProps {
  tail: string
  /** Link target; defaults to the Flightradar24 page for the tail. */
  href?: string
  className?: string
}

function typeLine(manufacturer: string | null, description: string): string {
  if (!manufacturer) return description
  return description.toLowerCase().startsWith(manufacturer.toLowerCase())
    ? description
    : `${manufacturer} ${description}`
}

function TailHoverBody({ tail, open }: { tail: string; open: boolean }) {
  // Only looks up while the card is open, so a board of cards makes no requests until hovered.
  const { data, isFetching, isError } = useAircraftTypeLookup(open ? tail : null)
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)

  const showPhoto = !!data?.photoUrl && failedPhoto !== data.photoUrl

  return (
    <div className="space-y-2 text-sm">
      {isFetching ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isError ? (
        <p className="text-muted-foreground">Could not look up {tail}.</p>
      ) : !data ? (
        <p className="text-muted-foreground">No registry match for {tail}</p>
      ) : (
        <>
          {showPhoto && (
            <div className="space-y-1">
              <div className="aspect-[4/3] w-full overflow-hidden rounded bg-muted">
                <img
                  src={data.photoUrl ?? undefined}
                  alt={`${tail} aircraft`}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={() => setFailedPhoto(data.photoUrl)}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Photo: airport-data.com
              </p>
            </div>
          )}
          <p className="font-medium">
            {typeLine(data.manufacturer, data.typeDescription)}{' '}
            <span className="font-normal text-muted-foreground">
              {data.typeIcao}
            </span>
          </p>
          {data.owner && (
            <div>
              <p className="text-xs text-muted-foreground">Registered owner</p>
              <p>
                {data.owner}
                {data.ownerCountry && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({data.ownerCountry})
                  </span>
                )}
              </p>
            </div>
          )}
        </>
      )}
      <p className="border-t pt-2 text-xs text-muted-foreground">
        Click the tail number to track on Flightradar24
      </p>
    </div>
  )
}

/**
 * Tail number link (Flightradar24 by default) with a hover card showing the
 * aircraft photo, type and registered owner from the registry lookup.
 */
export function TailNumberLink({ tail, href, className }: TailNumberLinkProps) {
  const [open, setOpen] = useState(false)

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={href ?? flightradarUrl(tail)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`Track ${tail} on Flightradar24`}
          className={className}
        >
          {tail}
        </a>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <TailHoverBody tail={tail} open={open} />
      </HoverCardContent>
    </HoverCard>
  )
}
