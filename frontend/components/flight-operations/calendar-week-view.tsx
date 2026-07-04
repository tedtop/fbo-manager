'use client'

import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
  Plus
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  onEditFlight: (flight: Flight) => void
  onDeleteFlight: (id: string) => void
  filters: FilterType
  weekOffset: number
  onWeekChange: (offset: number) => void
}

// --- Helpers ---

function getDateStr(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTimeStr(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function parseLocalTimestamp(timestamp: string): Date {
  // Parsing ISO string in local context is tricky if strictly using new Date(iso) which parses as key.
  // But our timestamps from backend are full ISO8601 with offset or Z.
  // The backend script generates with timezone.make_aware.
  // If we want to display them in LOCAL browser time, new Date(iso) is correct.
  return new Date(timestamp)
}

// Pure pixel/time conversions for the drag grid (80px per hour, snapped to 15min)
function getPositionFromTime(time: string): number {
  const [h, m] = time.split(':').map(Number)
  const mins = h * 60 + m
  return mins * (80 / 60)
}

function getTimeFromPosition(y: number): string {
  const pxPerMin = 80 / 60
  const mins = y / pxPerMin
  // Snap to 15
  const snapped = Math.round(mins / 15) * 15
  const h = Math.floor(snapped / 60)
  const m = snapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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
  const [hoveredSlot, setHoveredSlot] = useState<{
    day: string
    time: string
  } | null>(null)
  const [showAddButton, setShowAddButton] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const MIN_WEEK_OFFSET = -2
  const MAX_WEEK_OFFSET = 2

  // --- Date / Grid Calculation ---

  const weekDays = useMemo(() => {
    const days = []
    const today = new Date()
    const currentDay = today.getDay() // 0 = Sunday
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - currentDay + weekOffset * 7)
    // Normalize to start of day
    startOfWeek.setHours(0, 0, 0, 0)

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      days.push(date)
    }
    return days
  }, [weekOffset])

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

    for (const flight of flights) {
      // Filter
      if (filters.search) {
        const s = filters.search.toLowerCase()
        const matches =
          flight.tailNumber.toLowerCase().includes(s) ||
          flight.aircraftType.toLowerCase().includes(s) ||
          flight.origin?.toLowerCase().includes(s) ||
          flight.destination?.toLowerCase().includes(s)
        if (!matches) continue
      }
      if (filters.status !== 'all' && flight.status !== filters.status) continue
      if (filters.services.length > 0) {
        const hasAll = filters.services.every((svc) =>
          flight.services.includes(svc)
        )
        if (!hasAll) continue
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

      if (!intervalStart || !intervalEnd) continue

      // Iterate Week Days to intersect
      for (const dayDate of weekDays) {
        const dayStart = new Date(dayDate) // 00:00
        const dayEnd = new Date(dayDate)
        dayEnd.setHours(23, 59, 59, 999)

        // Check intersection
        // Flight Interval: [intervalStart, intervalEnd]
        // Day Interval: [dayStart, dayEnd]
        // Overlap if (StartA <= EndB) and (EndA >= StartB)

        if (intervalStart <= dayEnd && intervalEnd >= dayStart) {
          // Calculate block for this day
          // BlockStart = Max(intervalStart, dayStart)
          // BlockEnd = Min(intervalEnd, dayEnd)

          const blockStart = intervalStart > dayStart ? intervalStart : dayStart
          const blockEnd = intervalEnd < dayEnd ? intervalEnd : dayEnd

          // Determine type
          let type: BlockType = 'stay'
          const isStart = blockStart.getTime() === intervalStart?.getTime()
          const isEnd = blockEnd.getTime() === intervalEnd?.getTime()

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
            id: `${flight.id}-${getDateStr(dayDate)}`,
            flightId: flight.id,
            flight: flight,
            type,
            startTime: blockStart.toISOString(),
            endTime: blockEnd.toISOString(),
            day: getDateStr(dayDate),
            isStart,
            isEnd
          })
        }
      }
    }

    return result
  }, [flights, filters, weekDays])

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

  // Block Dragging

  const getDayIndexFromX = useCallback((x: number) => {
    if (!scrollContainerRef.current) return 0
    const rect = scrollContainerRef.current.getBoundingClientRect()
    const relativeX = x - rect.left + scrollContainerRef.current.scrollLeft
    const timeColWidth = 80
    const dayColWidth =
      (scrollContainerRef.current.scrollWidth - timeColWidth) / 7
    return Math.max(
      0,
      Math.min(6, Math.floor((relativeX - timeColWidth) / dayColWidth))
    )
  }, [])

  const handleBlockDragStart = (e: React.MouseEvent, block: CalendarBlock) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggedBlock(block)
    setDragStartY(e.clientY)
    setDragStartX(e.clientX)

    const start = new Date(block.startTime)
    const dStr = getDateStr(start)
    const tStr = getTimeStr(start)

    setDragStartBlockDate(dStr)
    setDragStartBlockTime(tStr)
    setTempDragDate(dStr)
    setTempDragTime(tStr)
  }

  const handleBlockDragMove = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
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
      const baseDate = new Date(dragStartBlockDate) // YYYY-MM-DD local
      // Add delta
      // Use simple date math
      const newDate = new Date(baseDate)
      newDate.setDate(baseDate.getDate() + dayDelta)
      const newDateStr = getDateStr(newDate)

      setTempDragTime(newTime)
      setTempDragDate(newDateStr)
    },
    [
      draggedBlock,
      dragStartBlockTime,
      dragStartBlockDate,
      dragStartY,
      dragStartX,
      getDayIndexFromX
    ]
  )

  const handleBlockDragEnd = useCallback(() => {
    if (!draggedBlock) return

    // Did it change?
    if (
      tempDragTime === dragStartBlockTime &&
      tempDragDate === dragStartBlockDate
    ) {
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
    const [oldY, oldM, oldD] = dragStartBlockDate.split('-').map(Number)
    const [oldH, oldMin] = dragStartBlockTime.split(':').map(Number)
    const oldStartObj = new Date(oldY, oldM - 1, oldD, oldH, oldMin)

    // NEW Start (Block)
    const [newY, newM, newD] = tempDragDate.split('-').map(Number)
    const [newH, newMin] = tempDragTime.split(':').map(Number)
    const newStartObj = new Date(newY, newM - 1, newD, newH, newMin)

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
      const oldDep = new Date(flight.departureTime).getTime()
      updatedFlight.departureTime = new Date(oldDep + deltaMs).toISOString()
    } else if (draggedBlock.type === 'departure') {
      // Moving departure block -> Update Departure Time
      // If we move departure, do we move arrival?
      // Maybe not? Maybe we are just delaying departure.
      // Let's assume moving departure ONLY changes departure.
      const oldDep = new Date(flight.departureTime).getTime()
      updatedFlight.departureTime = new Date(oldDep + deltaMs).toISOString()
    } else if (
      draggedBlock.type === 'quick_turn' ||
      draggedBlock.type === 'stay'
    ) {
      // QT/Stay -> Shift both
      if (flight.arrivalTime) {
        const oldArr = new Date(flight.arrivalTime).getTime()
        updatedFlight.arrivalTime = new Date(oldArr + deltaMs).toISOString()
      }
      const oldDep = new Date(flight.departureTime).getTime()
      updatedFlight.departureTime = new Date(oldDep + deltaMs).toISOString()
    }

    onEditFlight(updatedFlight)
    setDraggedBlock(null)
    setTempDragTime('')
    setTempDragDate('')
  }, [
    draggedBlock,
    tempDragTime,
    tempDragDate,
    dragStartBlockTime,
    dragStartBlockDate,
    onEditFlight
  ])

  // Global listeners so drag continues even if the pointer leaves the block
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (draggedBlock) handleBlockDragEnd()
      setIsDragging(false)
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggedBlock) handleBlockDragMove(e)
    }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      window.removeEventListener('mousemove', handleGlobalMouseMove)
    }
  }, [draggedBlock, handleBlockDragEnd, handleBlockDragMove])

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

  const handleCreate = (
    day: string,
    time: string,
    type: 'arrival' | 'departure'
  ) => {
    const ts = `${day}T${time}:00`
    const baseDate = new Date(ts)

    const newF: Partial<Flight> = {
      type: type === 'arrival' ? 'arrival' : 'departure',
      status: 'scheduled',
      tailNumber: '',
      aircraftType: ''
    }

    if (type === 'arrival') {
      newF.arrivalTime = ts
      // Default 1h later dep
      const dep = new Date(baseDate.getTime() + 3600000)
      newF.departureTime = dep.toISOString().slice(0, 16)
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
      case 'arrived':
        return theme === 'dark'
          ? 'bg-green-900/40 border-green-700 text-green-100'
          : 'bg-green-100 border-green-300 text-green-900'
      case 'departed':
        return theme === 'dark'
          ? 'bg-blue-900/40 border-blue-700 text-blue-100'
          : 'bg-blue-100 border-blue-300 text-blue-900'
      default:
        return theme === 'dark'
          ? 'bg-slate-800 border-slate-600 text-slate-200'
          : 'bg-white border-slate-300 text-slate-900'
    }
  }

  return (
    <div className="space-y-6 select-none">
      {/* Height constraint/overflow handled by parent properly? check. */}
      <div
        className={`rounded-lg border overflow-hidden flex flex-col h-[800px] ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <Button variant="ghost" onClick={() => onWeekChange(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Prev
          </Button>
          <div className="text-center font-bold text-lg">
            {weekDays[0] &&
              weekDays[6] &&
              `${weekDays[0].toLocaleDateString()} - ${weekDays[6].toLocaleDateString()}`}
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
              <div className="p-4 border-r" />
              {weekDays.map((d) => (
                <div
                  key={d.toString()}
                  className="p-2 text-center border-r font-semibold"
                >
                  {d.toLocaleDateString('en-US', {
                    weekday: 'short',
                    day: 'numeric'
                  })}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] relative">
              {/* Time Col */}
              <div className="border-r">
                {timeSlots.map((t) => (
                  <div
                    key={t}
                    className="h-20 border-b text-xs p-1 text-right text-muted-foreground mr-1"
                  >
                    {t}
                  </div>
                ))}
              </div>

              {/* Days Cols */}
              {weekDays.map((date, idx) => {
                const dStr = getDateStr(date)
                // Find blocks for this day
                const dayBlocks = blocks.filter((b) => {
                  // Interactive drag override
                  if (draggedBlock && draggedBlock.id === b.id) {
                    return tempDragDate === dStr
                  }
                  return b.day === dStr
                })

                return (
                  <div key={dStr} className="relative border-r min-h-[1920px]">
                    {/* Grid Lines */}
                    {timeSlots.map((t) => (
                      <div
                        key={t}
                        className="h-20 border-b border-slate-200/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors"
                        onMouseEnter={() => handleSlotHover(dStr, t)}
                        onMouseLeave={handleSlotLeave}
                      >
                        {/* Add Buttons */}
                        {hoveredSlot?.day === dStr &&
                          hoveredSlot?.time === t &&
                          showAddButton && (
                            <div className="absolute ml-2 mt-2 flex gap-1 z-30">
                              <button
                                type="button"
                                onClick={() => handleCreate(dStr, t, 'arrival')}
                                className="p-1 bg-green-500 rounded text-white shadow hover:scale-110 transition"
                              >
                                <PlaneLanding size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCreate(dStr, t, 'departure')
                                }
                                className="p-1 bg-blue-500 rounded text-white shadow hover:scale-110 transition"
                              >
                                <PlaneTakeoff size={14} />
                              </button>
                            </div>
                          )}
                      </div>
                    ))}
                    {/* Blocks */}
                    {dayBlocks.map((block) => {
                      const isDrag = draggedBlock?.id === block.id
                      const time = isDrag
                        ? tempDragTime
                        : getTimeStr(new Date(block.startTime))
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
                            {block.type === 'arrival' && (
                              <PlaneLanding size={12} />
                            )}
                            {block.type === 'departure' && (
                              <PlaneTakeoff size={12} />
                            )}
                            {block.type === 'quick_turn' && (
                              <span className="flex">
                                <PlaneLanding size={12} />/
                                <PlaneTakeoff size={12} />
                              </span>
                            )}
                            {block.type === 'stay' && (
                              <span className="text-[10px] uppercase font-mono bg-black/20 px-1 rounded">
                                STAY
                              </span>
                            )}
                            <span>{block.flight.tailNumber}</span>
                          </div>
                          <div className="truncate opacity-75">
                            {block.flight.aircraftType}
                          </div>
                          {block.type !== 'stay' && (
                            <div className="truncate opacity-75">
                              {block.type === 'arrival'
                                ? `Arr: ${block.flight.origin}`
                                : `Dep: ${block.flight.destination}`}
                            </div>
                          )}

                          <button
                            type="button"
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
          onSubmit={(f) => {
            onEditFlight(f)
            setEditDialogOpen(false)
          }}
          initialData={editingFlight}
          theme={theme}
        />
      )}
    </div>
  )
}
