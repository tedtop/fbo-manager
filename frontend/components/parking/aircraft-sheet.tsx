'use client'

import { TailNumberLink } from '@/components/aircraft/tail-number-link'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import {
  type ParkedPlane,
  canRevertHeading,
  headingForScreenDirection,
  toStoredHeading
} from '@/lib/parking-map'
import { Plane, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CompassRose } from './compass-rose'

interface AircraftSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plane: ParkedPlane | null
  /** Name of the area the plane is inside, or null for the open ramp. */
  areaLabel: string | null
  mapBearing: number
  removing: boolean
  onHeadingChange: (heading: number) => void
  onRemove: () => void
}

const SCREEN_DIRECTIONS = [
  { label: 'Face left', degrees: 270, rotate: 225 },
  { label: 'Face up', degrees: 0, rotate: 315 },
  { label: 'Face right', degrees: 90, rotate: 45 },
  { label: 'Face down', degrees: 180, rotate: 135 }
]

export function AircraftSheet({
  open,
  onOpenChange,
  plane,
  areaLabel,
  mapBearing,
  removing,
  onHeadingChange,
  onRemove
}: AircraftSheetProps) {
  // The heading the plane had when it was selected, so a change can be reverted before or after it saves.
  const [start, setStart] = useState<{ tail: string; heading: number } | null>(
    null
  )
  const tail = plane?.tailNumber ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: capture the heading only when the plane or sheet changes
  useEffect(() => {
    setStart(plane && open ? { tail: plane.tailNumber, heading: plane.heading } : null)
  }, [tail, open])

  if (!plane) return null
  const heading = toStoredHeading(plane.heading)
  const original = start?.tail === plane.tailNumber ? start.heading : heading
  const canRevert = canRevertHeading(original, heading)

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]"
        // Keep the map usable while the sheet is open: clicking another plane switches to it.
        onInteractOutside={(e) => e.preventDefault()}
        // Focus must stay off the form so arrow keys still move the plane.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>
            <TailNumberLink tail={plane.tailNumber} />
          </SheetTitle>
          <SheetDescription>
            {plane.typeDisplay || 'Aircraft on the ramp'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Location</dt>
            <dd className="font-medium">{areaLabel ?? 'On open ramp'}</dd>
            <dt className="text-muted-foreground">Heading</dt>
            <dd className="font-medium tabular-nums">{heading}°</dd>
          </dl>

          <div className="space-y-3">
            <Label>Orient the aircraft</Label>
            <CompassRose
              heading={heading}
              mapBearing={mapBearing}
              typeIcao={plane.typeIcao}
              onChange={onHeadingChange}
            />
            <div className="grid grid-cols-4 gap-2">
              {SCREEN_DIRECTIONS.map((d) => (
                <Button
                  key={d.label}
                  type="button"
                  variant="outline"
                  size="icon"
                  className="w-full"
                  title={d.label}
                  aria-label={d.label}
                  onClick={() =>
                    onHeadingChange(
                      headingForScreenDirection(d.degrees, mapBearing)
                    )
                  }
                >
                  <Plane
                    className="size-4"
                    style={{ transform: `rotate(${d.rotate}deg)` }}
                  />
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canRevert}
              onClick={() => onHeadingChange(toStoredHeading(original))}
            >
              <Undo2 className="mr-2 size-4" />
              {canRevert
                ? `Undo heading change (back to ${toStoredHeading(original)}°)`
                : 'Undo heading change'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Click or drag on the compass to point the aircraft (the top of the
              compass is the top of the map). With the compass focused, the
              arrow keys turn it by 1 degree, 10 with Shift. Drag the plane on
              the map to move it. With it selected on the map, arrow keys turn
              (left/right) and move (up/down) it, and Cmd/Ctrl+Z undoes the last
              move.
            </p>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            disabled={removing}
            onClick={onRemove}
            className="w-full sm:w-auto"
          >
            <Trash2 className="mr-2 size-4" />
            {removing ? 'Removing...' : 'Remove from ramp'}
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
