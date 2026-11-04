'use client'

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
import { Slider } from '@/components/ui/slider'
import {
  type ParkedPlane,
  headingForScreenDirection,
  toStoredHeading
} from '@/lib/parking-map'
import { Plane, Trash2 } from 'lucide-react'

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
  if (!plane) return null
  const heading = toStoredHeading(plane.heading)

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
          <SheetTitle>{plane.tailNumber}</SheetTitle>
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
            <Label htmlFor="plane-heading">Heading</Label>
            <div className="flex items-center gap-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-muted"
                aria-hidden="true"
              >
                <Plane
                  className="size-6 text-primary"
                  fill="currentColor"
                  style={{
                    transform: `rotate(${heading - mapBearing - 45}deg)`
                  }}
                />
              </div>
              <Slider
                id="plane-heading"
                min={0}
                max={359}
                step={1}
                value={[heading]}
                onValueChange={([value]) => onHeadingChange(value)}
                aria-label="Heading in degrees"
              />
            </div>
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
            <p className="text-xs text-muted-foreground">
              Drag the plane on the map to move it. With it selected, arrow keys
              turn (left/right) and move (up/down) it, and Cmd/Ctrl+Z undoes the
              last move.
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
