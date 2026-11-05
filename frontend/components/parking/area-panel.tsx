'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KIND_META, type ParkingAreaKind } from '@/lib/parking-map'
import { cn } from '@/lib/utils'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import { Archive, Check, Pencil, Plus } from 'lucide-react'
import { DRAW_FINISH_HINT, type DrawMode, EDIT_HINT } from './use-area-drawing'

interface AreaPanelProps {
  areas: readonly ParkingAreaRow[]
  /** Planes currently inside each area, keyed by area id. */
  counts: ReadonlyMap<number, number>
  selectedId: number | null
  loading: boolean
  drawMode: DrawMode
  onSelect: (area: ParkingAreaRow) => void
  onNew: () => void
  onEdit: (area: ParkingAreaRow) => void
  onArchive: (area: ParkingAreaRow) => void
  onDraw: () => void
  onSnapToGrid: () => void
  onCancelDrawing: () => void
  onClearBoundary: () => void
}

function KindBadge({ kind }: { kind: ParkingAreaKind }) {
  const meta = KIND_META[kind]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />
      {meta.label}
    </Badge>
  )
}

export function AreaPanel({
  areas,
  counts,
  selectedId,
  loading,
  drawMode,
  onSelect,
  onNew,
  onEdit,
  onArchive,
  onDraw,
  onSnapToGrid,
  onCancelDrawing,
  onClearBoundary
}: AreaPanelProps) {
  const selected = areas.find((a) => a.id === selectedId) ?? null
  const hasBoundary = Boolean(selected?.polygon)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="text-sm font-semibold">Areas ({areas.length})</h2>
        <Button size="sm" onClick={onNew}>
          <Plus className="mr-1 size-4" />
          New area
        </Button>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {areas.map((area) => {
          const count = counts.get(area.id) ?? 0
          const isSelected = area.id === selectedId
          return (
            <li
              key={area.id}
              className={cn(
                'flex items-start gap-1 p-2',
                isSelected && 'bg-accent'
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(area)}
                aria-pressed={isSelected}
                className="min-w-0 flex-1 rounded-md p-1 text-left hover:bg-accent/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{area.code}</span>
                  <KindBadge kind={area.kind} />
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {area.name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{count} aircraft inside</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      !area.polygon && 'text-amber-600 dark:text-amber-400'
                    )}
                  >
                    {area.polygon ? (
                      <>
                        <Check className="size-3" aria-hidden="true" />
                        Boundary drawn
                      </>
                    ) : (
                      'No boundary yet'
                    )}
                  </span>
                </div>
              </button>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onEdit(area)}
                  title={`Edit ${area.code}`}
                  aria-label={`Edit ${area.code}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onArchive(area)}
                  title={`Archive ${area.code}`}
                  aria-label={`Archive ${area.code}`}
                >
                  <Archive className="size-4" />
                </Button>
              </div>
            </li>
          )
        })}
        {areas.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            {loading
              ? 'Loading areas...'
              : 'No areas yet. Create one, then draw its boundary on the map.'}
          </li>
        )}
      </ul>

      <div className="space-y-2 border-t border-border p-3">
        {selected ? (
          <>
            <p className="text-sm font-medium">Boundary for {selected.code}</p>
            {drawMode === 'drawing' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Click each corner of the boundary on the map.{' '}
                  <strong className="text-foreground">
                    {DRAW_FINISH_HINT}
                  </strong>
                </p>
                <Button size="sm" variant="outline" onClick={onCancelDrawing}>
                  Cancel drawing
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={onDraw}>
                    {hasBoundary ? 'Redraw boundary' : 'Draw boundary'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onSnapToGrid}
                    disabled={!hasBoundary}
                    title={
                      hasBoundary
                        ? 'Square the shape up into a rectangle aligned with the map as you see it'
                        : 'Draw a boundary first'
                    }
                  >
                    Snap to grid
                  </Button>
                  {hasBoundary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onClearBoundary}
                    >
                      Clear boundary
                    </Button>
                  )}
                </div>
                {drawMode === 'editing' && (
                  <p className="text-xs text-muted-foreground">{EDIT_HINT}</p>
                )}
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an area to draw or edit its boundary. You can also click an
            area on the map; click empty map to deselect.
          </p>
        )}
      </div>
    </div>
  )
}
