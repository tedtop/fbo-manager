'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
  Plus
} from 'lucide-react'
import { useDisplayZone } from '@/hooks/use-display-zone'
import {
  addLocalDays,
  formatLocalDate,
  formatLocalTime,
  parseLocalDate,
  zonedTimeToInstant
} from '@/lib/local-date'
import { weekRange } from './board-logic'
import { FlightFormDialog } from './flight-form-dialog'
import type { FlightFilters as FilterType, Flight } from './types'

// --- Types ---
type BlockType = 'arrival' | 'departure' | 'quick_turn' | 'stay'

interface CalendarBlock {
  id: string // composite id: flightId-dayIndex
  flightId: string
  flight: Flight
  type: BlockType
  startTime: string // ISO timestamp of block start (for positioning)
  endTime: string // ISO timestamp of block end (for height)
  day: string // YYYY-MM-DD
  isStart: boolean
  isEnd: boolean
}

interface CalendarWeekViewProps {
  theme: 'dark' | 'light'
  flights: Flight[]
  onEditFlight: (flight: Flight, expectedUpdatedAt?: string) => void | Promise<void>
  onDeleteFlight: (id: string) => void
  filters: FilterType
  weekOffset: number
  onWeekChange: (offset: number) => void
}

// --- Helpers ---

// Date and time of an instant in the display zone (FBO zone, or UTC in Zulu mode).
function getDateStr(date: Date, zone: string): string {
  return formatLocalDate(date, zone)
}

function getTimeStr(date: Date, zone: string): string {
  return formatLocalTime(date, zone)
}

// Instant at which `zone`'s wall clock reads `day` ("YYYY-MM-DD") `time` ("HH:mm").
function parseZonedDateTime(day: string, time: string, zone: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return zonedTimeToInstant(y, m, d, h, min, zone)
}

// Header label of a "YYYY-MM-DD" day (pure calendar date, so rendered in UTC to avoid any shift).
function dayLabel(day: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC'
  })
}

function parseLocalTimestamp(timestamp: string): Date {
  // Parsing ISO string in local context is tricky if strictly using new Date(iso) which parses as key. 
  // But our timestamps from backend are full ISO8601 with offset or Z.
  // The backend script generates with timezone.make_aware. 
  // If we want to display them in LOCAL browser time, new Date(iso) is correct.
  return new Date(timestamp)
}

// --- Component ---

export function CalendarWeekView({
  theme,
  flights,
  onEditFlight,
  filters,
  weekOffset,
  onWeekChange
}: CalendarWeekViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { zone, label: zoneLabel } = useDisplayZone()

  // Drag State
  const [isDragging, setIsDragging] = useState(false)
  const [draggedBlock, setDraggedBlock] = useState<CalendarBlock | null>(null)

  // Mouse tracking for drag
  const [dragStartY, setDragStartY] = useState(0)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartBlockTime, setDragStartBlockTime] = useState('') // HH:mm
  const [dragStartBlockDate, setDragStartBlockDate] = useState('') // YYYY-MM-DD

  // Visual feedback during drag
  const [tempDragTime, setTempDragTime] = useState('') // HH:mm
  const [tempDragDate, setTempDragDate] = useState('') // YYYY-MM-DD

  // Scroll Drag
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null)

  // Hover interact
  const [hoveredSlot, setHoveredSlot] = useState<{ day: string; time: string } | null>(null)
  const [showAddButton, setShowAddButton] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const MIN_WEEK_OFFSET = -2
  const MAX_WEEK_OFFSET = 2

  // --- Date / Grid Calculation ---

  const weekDays = useMemo(() => {
    // The seven "YYYY-MM-DD" days of the Sunday-start week, in the display zone.
    const startOfWeek = formatLocalDate(weekRange(new Date(), weekOffset, zone).start, zone)
    return Array.from({ length: 7 }, (_, i) => addLocalDays(startOfWeek, i))
  }, [weekOffset, zone])

  const timeSlots = useMemo(() => {
    const slots = []
    for (let hour = 0; hour <= 23; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`)
    }
    return slots
  }, [])

  // --- Flight -> Block Transformation ---

  const blocks = useMemo(() => {
    const result: CalendarBlock[] = []

    // Helper to check day overlap
    // Iterate over flights, then for each flight, iterate over Visible Week Days
    // This handles multi-day splitting naturally.

    flights.forEach(flight => {
      // Filter
      if (filters.search) {
        const s = filters.search.toLowerCase()
        const matches =
          flight.tailNumber.toLowerCase().includes(s) ||
          flight.aircraftType.toLowerCase().includes(s) ||
          flight.origin?.toLowerCase().includes(s) ||
          flight.destination?.toLowerCase().includes(s)
        if (!matches) return
      }
      if (filters.status !== 'all' && flight.status !== filters.status) return
      if (filters.services.length > 0) {
        const hasAll = filters.services.every(svc => flight.services.includes(svc))
        if (!hasAll) return
      }

      // Define Flight Interval [Start, End]
      // If flight is arrival only (no dep), end is... ? 1h later.
      // If dep only, start is... ? 1h earlier.
      // If both, interval is Arr -> Dep.

      let intervalStart: Date | null = null
      let intervalEnd: Date | null = null

      if (flight.arrivalTime) {
        intervalStart = parseLocalTimestamp(flight.arrivalTime)
        if (flight.departureTime) {
          intervalEnd = parseLocalTimestamp(flight.departureTime)
        } else {
          // Should not happen in generated data, but fallback
          intervalEnd = new Date(intervalStart.getTime() + 60 * 60 * 1000)
        }
      } else if (flight.departureTime) {
        intervalEnd = parseLocalTimestamp(flight.departureTime)
        // Default start 1h before dep
        intervalStart = new Date(intervalEnd.getTime() - 60 * 60 * 1000)
      }

      if (!intervalStart || !intervalEnd) return

      // Iterate Week Days to intersect
      weekDays.forEach((dayStr) => {
        const dayStart = parseLocalDate(dayStr, zone) // 00:00 in the display zone
        const dayEnd = new Date(parseLocalDate(addLocalDays(dayStr, 1), zone).getTime() - 1)

        // Check intersection
        // Flight Interval: [intervalStart, intervalEnd]
        // Day Interval: [dayStart, dayEnd]
        // Overlap if (StartA <= EndB) and (EndA >= StartB)

        if (intervalStart! <= dayEnd && intervalEnd! >= dayStart) {
          // Calculate block for this day
          // BlockStart = Max(intervalStart, dayStart)
          // BlockEnd = Min(intervalEnd, dayEnd)

          const blockStart = intervalStart! > dayStart ? intervalStart! : dayStart
          const blockEnd = intervalEnd! < dayEnd ? intervalEnd! : dayEnd

          // Determine type
          let type: BlockType = 'stay'
          const isStart = blockStart.getTime() === intervalStart!.getTime()
          const isEnd = blockEnd.getTime() === intervalEnd!.getTime()

          if (isStart && isEnd) {
            // Fully contained in day -> check if it's visually a quick turn
            type = 'quick_turn' // Or just call it 'single_block'
          } else if (isStart) {
            type = 'arrival'
          } else if (isEnd) {
            type = 'departure'
          } else {
            type = 'stay'
          }

          result.push({
            id: `${flight.id}-${dayStr}`,
            flightId: flight.id,
            flight: flight,
            type,
            startTime: blockStart.toISOString(),
            endTime: blockEnd.toISOString(),
            day: dayStr,
            isStart,
            isEnd
          })
        }
      })
    })

    return result
  }, [flights, filters, weekDays, zone])

  // --- Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag scroll if not clicking a block
    if ((e.target as HTMLElement).closest('.flight-block')) return

    if (!scrollContainerRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft)
    setScrollLeft(scrollContainerRef.current.scrollLeft)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && !draggedBlock && scrollContainerRef.current) {
      e.preventDefault()
      const x = e.pageX - scrollContainerRef.current.offsetLeft
      const walk = (x - startX) * 2
      scrollContainerRef.current.scrollLeft = scrollLeft - walk
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (draggedBlock) handleBlockDragEnd()
      setIsDragging(false)
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggedBlock) handleBlockDragMove(e as any)
    }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      window.removeEventListener('mousemove', handleGlobalMouseMove)
    }
  }, [draggedBlock, tempDragTime, tempDragDate])


  // Block Dragging

  const getPositionFromTime = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    const mins = h * 60 + m
    const startMins = 0 // Start at 00:00 for full day support?
    // Current layout seems to start at 00:00 based on timeSlots.
    // CSS grid: 80px per hour means 80/60 px per min.
    return mins * (80 / 60)
  }

  const getTimeFromPosition = (y: number) => {
    const pxPerMin = 80 / 60
    const mins = y / pxPerMin
    // Snap to 15
    const snapped = Math.round(mins / 15) * 15
    const h = Math.floor(snapped / 60)
    const m = snapped % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const getDayIndexFromX = (x: number) => {
    if (!scrollContainerRef.current) return 0
    const rect = scrollContainerRef.current.getBoundingClientRect()
    const relativeX = x - rect.left + scrollContainerRef.current.scrollLeft
    const timeColWidth = 80
    const dayColWidth = (scrollContainerRef.current.scrollWidth - timeColWidth) / 7
    return Math.max(0, Math.min(6, Math.floor((relativeX - timeColWidth) / dayColWidth)))
  }

  const handleBlockDragStart = (e: React.MouseEvent, block: CalendarBlock) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedBlock(block)
    setDragStartY(e.clientY)
    setDragStartX(e.clientX)

    const start = new Date(block.startTime)
    const dStr = getDateStr(start, zone)
    const tStr = getTimeStr(start, zone)

    setDragStartBlockDate(dStr)
    setDragStartBlockTime(tStr)
    setTempDragDate(dStr)
    setTempDragTime(tStr)
  }

  const handleBlockDragMove = (e: React.MouseEvent) => {
    if (!draggedBlock) return
    e.preventDefault()

    // Y Axis -> Time
    const startYPos = getPositionFromTime(dragStartBlockTime)
    const currentYPos = startYPos + (e.clientY - dragStartY)
    // Clamp to 0 - 24h (24*80 = 1920)
    const clampedY = Math.max(0, Math.min(1920, currentYPos))
    const newTime = getTimeFromPosition(clampedY)

    // X Axis -> Day
    const startDayIdx = getDayIndexFromX(dragStartX)
    const currentDayIdx = getDayIndexFromX(e.clientX)
    const dayDelta = currentDayIdx - startDayIdx

    // Calc new date
    const newDateStr = addLocalDays(dragStartBlockDate, dayDelta) // calendar arithmetic, DST-safe

    setTempDragTime(newTime)
    setTempDragDate(newDateStr)
  }

  const handleBlockDragEnd = () => {
    if (!draggedBlock) return

    // Did it change?
    if (tempDragTime === dragStartBlockTime && tempDragDate === dragStartBlockDate) {
      setDraggedBlock(null)
      return
    }

    // Apply change
    // We need to construct the NEW timestamps relative to the move
    // We only update the 'startTime' of the block effectively, 
    // but we need to map that back to the FLIGHT fields (Arrival vs Departure).

    const flight = draggedBlock.flight
    const updatedFlight = { ...flight }

    // Logic:
    // 1. Calculate the 'Delta' applied to the block's start time
    // 2. Apply that delta to the relevant flight fields.

    // OLD Start (Block)
    const oldStartObj = parseZonedDateTime(dragStartBlockDate, dragStartBlockTime, zone)

    // NEW Start (Block)
    const newStartObj = parseZonedDateTime(tempDragDate, tempDragTime, zone)

    const deltaMs = newStartObj.getTime() - oldStartObj.getTime()

    if (draggedBlock.type === 'arrival') {
      // Moving arrival block -> Update Arrival Time
      // Keep departure time relative? Or fixed? 
      // Context: "Move flight". Usually shifts the whole schedule.
      // But if split details, maybe just arrival?
      // Let's shift BOTH if it's an arrival move, to maintain turnaround time?
      // User said "move flights around". Implies shifting the whole thing.

      if (flight.arrivalTime) {
        const oldArr = new Date(flight.arrivalTime).getTime()
        updatedFlight.arrivalTime = new Date(oldArr + deltaMs).toISOString()
      }
      // Also shift departure to keep ground time constant? 
      // Yes, usually desired behavior in drag-drop unless specified otherwise.
      if (flight.departureTime) {
        const oldDep = new Date(flight.departureTime).getTime()
        updatedFlight.departureTime = new Date(oldDep + deltaMs).toISOString()
      }

    } else if (draggedBlock.type === 'departure') {
      // Moving departure block -> Update Departure Time
      // If we move departure, do we move arrival?
      // Maybe not? Maybe we are just delaying departure.
      // Let's assume moving departure ONLY changes departure.
      if (flight.departureTime) {
        const oldDep = new Date(flight.departureTime).getTime()
        updatedFlight.departureTime = new Date(oldDep + deltaMs).toISOString()
      }

    } else if (draggedBlock.type === 'quick_turn' || draggedBlock.type === 'stay') {
      // QT/Stay -> Shift both
      if (flight.arrivalTime) {
        const oldArr = new Date(flight.arrivalTime).getTime()
        updatedFlight.arrivalTime = new Date(oldArr + deltaMs).toISOString()
      }
      if (flight.departureTime) {
        const oldDep = new Date(flight.departureTime).getTime()
        updatedFlight.departureTime = new Date(oldDep + deltaMs).toISOString()
      }
    }

    void Promise.resolve(onEditFlight(updatedFlight)).catch(() => {})
    setDraggedBlock(null)
    setTempDragTime('')
    setTempDragDate('')
  }

  // --- Slot Interactions ---

  const handleSlotHover = (day: string, time: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setHoveredSlot({ day, time })
    setShowAddButton(false)
    hoverTimeoutRef.current = setTimeout(() => setShowAddButton(true), 200)
  }

  const handleSlotLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setHoveredSlot(null)
    setShowAddButton(false)
  }

  const handleCreate = (day: string, time: string, type: 'arrival' | 'departure') => {
    // day/time are wall-clock in the display zone; store real instants (UTC ISO), not offset-less strings
    const baseDate = parseZonedDateTime(day, time, zone)
    const ts = baseDate.toISOString()

    const newF: Partial<Flight> = {
      type: type === 'arrival' ? 'arrival' : 'departure',
      status: 'scheduled',
      tailNumber: '',
      aircraftType: '',
      isQuickTurn: type === 'arrival'
    }

    if (type === 'arrival') {
      newF.arrivalTime = ts
      // Default 1h later dep
      const dep = new Date(baseDate.getTime() + 3600000)
      newF.departureTime = dep.toISOString()
    } else {
      newF.departureTime = ts
    }

    setEditingFlight(newF as Flight)
    setEditDialogOpen(true)
    handleSlotLeave()
  }

  // --- Render ---

  const getStatusColor = (status: Flight['status']) => {
    switch (status) {
      case 'arrived': return 'bg-green-100 border-green-300 text-green-900 dark:bg-green-900/40 dark:border-green-700 dark:text-green-100'
      case 'departed': return 'bg-blue-100 border-blue-300 text-blue-900 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-100'
      default: return 'bg-white border-slate-300 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200'
    }
  }

  return (
    <div className="space-y-6 select-none">
      {/* Height constraint/overflow handled by parent properly? check. */}
      <div className="rounded-lg border overflow-hidden flex flex-col h-[800px] bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <Button variant="ghost" onClick={() => onWeekChange(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Prev
          </Button>
          <div className="text-center font-bold text-lg">
            {weekDays[0] && weekDays[6] && (
              `${dayLabel(weekDays[0])} - ${dayLabel(weekDays[6])}`
            )}
          </div>
          <Button variant="ghost" onClick={() => onWeekChange(weekOffset + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Grid Scroller */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto relative ${isDragging ? 'cursor-grabbing' : 'cursor-default'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div className="min-w-[1000px] relative">
            {/* Header Row (Days) */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 z-20 bg-inherit border-b">
              <div
                className="p-4 border-r text-center font-mono text-xs font-bold text-muted-foreground"
                data-testid="calendar-zone-label"
                title="Time zone of the calendar"
              >
                {zoneLabel}
              </div>
              {weekDays.map(d => (
                <div key={d} className="p-2 text-center border-r font-semibold">
                  {dayLabel(d, { weekday: 'short', day: 'numeric' })}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] relative">
              {/* Time Col */}
              <div className="border-r">
                {timeSlots.map(t => (
                  <div key={t} className="h-20 border-b text-xs p-1 text-right text-muted-foreground mr-1">
                    {t}
                  </div>
                ))}
              </div>

              {/* Days Cols */}
              {weekDays.map((dStr) => {
                // Find blocks for this day
                const dayBlocks = blocks.filter(b => {
                  // Interactive drag override
                  if (draggedBlock && draggedBlock.id === b.id) {
                    return tempDragDate === dStr
                  }
                  return b.day === dStr
                })

                return (
                  <div key={dStr} className="relative border-r min-h-[1920px]">
                    {/* Grid Lines */}
                    {timeSlots.map(t => (
                      <div
                        key={t}
                        className="h-20 border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors"
                        onMouseEnter={() => handleSlotHover(dStr, t)}
                        onMouseLeave={handleSlotLeave}
                      >
                        {/* Add Buttons */}
                        {hoveredSlot?.day === dStr && hoveredSlot?.time === t && showAddButton && (
                          <div className="absolute ml-2 mt-2 flex gap-1 z-30">
                            <button onClick={() => handleCreate(dStr, t, 'arrival')} className="p-1 bg-green-600 rounded text-white shadow hover:scale-110 transition"><PlaneLanding size={14} /></button>
                            <button onClick={() => handleCreate(dStr, t, 'departure')} className="p-1 bg-blue-600 rounded text-white shadow hover:scale-110 transition"><PlaneTakeoff size={14} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Blocks */}
                    {dayBlocks.map(block => {
                      const isDrag = draggedBlock?.id === block.id
                      const time = isDrag ? tempDragTime : getTimeStr(new Date(block.startTime), zone)
                      const top = getPositionFromTime(time)

                      // Calculate duration from start/end times
                      const startMs = new Date(block.startTime).getTime()
                      const endMs = new Date(block.endTime).getTime()
                      const durationMins = (endMs - startMs) / 60000
                      const height = (durationMins / 60) * 80

                      const isStay = block.type === 'stay'

                      return (
                        <div
                          key={block.id}
                          className={`absolute left-1 right-1 rounded p-2 text-xs border shadow-sm flight-block cursor-move overflow-hidden 
                                      ${getStatusColor(block.flight.status)} 
                                      ${isStay ? 'opacity-80' : ''}`}
                          style={{
                            top,
                            height: Math.max(height, 40),
                            zIndex: isDrag ? 50 : 10,
                            opacity: isDrag ? 0.9 : 1
                          }}
                          onMouseDown={(e) => handleBlockDragStart(e, block)}
                        >
                          <div className="flex gap-1 font-bold">
                            {block.type === 'arrival' && <PlaneLanding size={12} />}
                            {block.type === 'departure' && <PlaneTakeoff size={12} />}
                            {block.type === 'quick_turn' && (
                              <span className="flex"><PlaneLanding size={12} />/<PlaneTakeoff size={12} /></span>
                            )}
                            {block.type === 'stay' && (
                              <span className="text-[10px] uppercase font-mono bg-black/20 px-1 rounded">STAY</span>
                            )}
                            <span>{block.flight.tailNumber}</span>
                          </div>
                          <div className="truncate opacity-75">
                            {block.flight.aircraftType}
                          </div>
                          {block.type !== 'stay' && (
                            <div className="truncate opacity-75">
                              {block.type === 'arrival' ? `Arr: ${block.flight.origin}` : `Dep: ${block.flight.destination}`}
                            </div>
                          )}

                          <button
                            className="absolute top-1 right-1 p-1 hover:bg-black/10 rounded"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setEditingFlight(block.flight)
                              setEditDialogOpen(true)
                            }}
                          >
                            <Pencil size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {editingFlight && (
        <FlightFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSubmit={onEditFlight}
          initialData={editingFlight}
          theme={theme}
        />
      )}
    </div>
  )
}
