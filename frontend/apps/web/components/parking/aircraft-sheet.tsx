import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@frontend/ui/components/ui/sheet"
import { Button } from "@frontend/ui/components/ui/button"
import { Input } from "@frontend/ui/components/ui/input"
import { Label } from "@frontend/ui/components/ui/label"
import { Slider } from "@frontend/ui/components/ui/slider"
import { Trash2, Plane } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/ui/components/ui/select"
import { AIRCRAFT_TYPES, getAircraftDefinition } from "@/lib/aircraft-types"

const DEFAULT_AIRCRAFT_TYPE = "light_single"

interface AircraftSheetProps {
    isOpen: boolean
    onClose: () => void
    aircraft: {
        id: number
        tailNumber?: string
        aircraftType: string
        rotation?: number
        color?: string
    } | null
    onUpdate: (id: number, updates: { tailNumber?: string; aircraftType?: string; rotation?: number; color?: string }) => void
    onPreview?: (id: number, updates: { tailNumber?: string; aircraftType?: string; rotation?: number; color?: string }) => void
    onDelete: (id: number) => void
    mapRotation?: number
    rotationSyncRef?: React.MutableRefObject<((rotation: number) => void) | null>
}

export function AircraftSheet({ isOpen, onClose, aircraft, onUpdate, onPreview, onDelete, mapRotation = 0, rotationSyncRef }: AircraftSheetProps) {
    const [tailNumber, setTailNumber] = useState('')
    const [aircraftType, setAircraftType] = useState(DEFAULT_AIRCRAFT_TYPE)
    const [rotation, setRotation] = useState(0)
    const [visualRotation, setVisualRotation] = useState(0)
    const [color, setColor] = useState('#ffffff')
    const [isDragging, setIsDragging] = useState(false)

    const compassPlaneRef = useRef<HTMLDivElement>(null)
    const cumulativeRotationRef = useRef(0)

    // Helper to update compass rotation smoothly
    const updateCompassRotation = (targetRotation: number) => {
        if (!compassPlaneRef.current) return

        const current = cumulativeRotationRef.current
        // Calculate shortest delta
        let delta = (targetRotation - current) % 360
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360

        const newCumulative = current + delta
        cumulativeRotationRef.current = newCumulative

        compassPlaneRef.current.style.transform = `rotate(${newCumulative - mapRotation - 45}deg)`
    }

    // Update compass when mapRotation changes
    useEffect(() => {
        if (compassPlaneRef.current) {
            const current = cumulativeRotationRef.current
            compassPlaneRef.current.style.transform = `rotate(${current - mapRotation - 45}deg)`
        }
    }, [mapRotation])

    useEffect(() => {
        if (rotationSyncRef) {
            rotationSyncRef.current = (newRotation: number) => {
                updateCompassRotation(newRotation)
                setRotation(newRotation)
            }
        }
        return () => {
            if (rotationSyncRef) {
                rotationSyncRef.current = null
            }
        }
    }, [rotationSyncRef, mapRotation])

    useEffect(() => {
        if (isOpen && aircraft) {
            setTailNumber(aircraft.tailNumber || '')
            setAircraftType(aircraft.aircraftType || DEFAULT_AIRCRAFT_TYPE)
            setRotation(aircraft.rotation || 0)
            setColor(aircraft.color || '#ffffff')

            // Initialize cumulative ref if it's the first load or far off
            // But to avoid spinning on open, just set it.
            // Actually, we should sync it to the aircraft's rotation initially.
            // But we need to respect the previous cumulative value if we want to avoid spins?
            // No, on open, we just snap.
            cumulativeRotationRef.current = aircraft.rotation || 0

            // Update compass ref directly if it exists
            if (compassPlaneRef.current) {
                compassPlaneRef.current.style.transform = `rotate(${(aircraft.rotation || 0) - mapRotation - 45}deg)`
            }

            // Smooth rotation update
            setVisualRotation(prev => {
                const target = aircraft.rotation || 0
                let delta = (target - prev) % 360
                // Normalize delta to -180 to 180
                if (delta > 180) delta -= 360
                if (delta < -180) delta += 360
                return prev + delta
            })
        }
    }, [isOpen, aircraft?.id])

    const handleSave = () => {
        if (aircraft) {
            onUpdate(aircraft.id, { tailNumber, aircraftType, rotation, color })
        }
    }

    // Auto-save on slider change (debounced in parent or just live update)
    // For now, we'll just call onUpdate directly for sliders to see live changes if parent supports it
    // But to avoid too many API calls, we might want to wait for drag end or use a save button.
    // Usually sliders should be live. Let's make them live but maybe the parent handles debouncing if it's an API call.
    // For this implementation, we will trigger updates on change.

    if (!aircraft) return null

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent
                side="right"
                className="sm:max-w-[400px] flex flex-col dark border-l border-border bg-background text-foreground shadow-2xl p-0 gap-0"
                onOpenAutoFocus={(e) => {
                    // Prevent auto-focusing the first input (Tail Number)
                    e.preventDefault()
                    // Focus the container instead so keyboard events (arrows) work immediately
                    // We can't easily ref the container here, but preventing default keeps focus on the trigger
                    // or we can manually focus something else.
                    // Let's try just preventing default first.
                }}
            >
                <SheetHeader className="p-4 border-b border-border">
                    <SheetTitle>Edit Aircraft</SheetTitle>
                    <SheetDescription>
                        Modify aircraft details and orientation.
                    </SheetDescription>
                </SheetHeader>

                <div className="grid gap-2 py-4 p-4 overflow-y-auto flex-1">
                    <div className="grid gap-2">
                        <Label htmlFor="tailNumber">Tail Number / Label</Label>
                        <Input
                            id="tailNumber"
                            value={tailNumber}
                            onChange={(e) => {
                                setTailNumber(e.target.value)
                                if (onPreview && aircraft) onPreview(aircraft.id, { tailNumber: e.target.value })
                                onUpdate(aircraft!.id, { tailNumber: e.target.value })
                            }}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Aircraft Type</Label>
                        <Select
                            value={aircraftType}
                            onValueChange={(value) => {
                                setAircraftType(value)
                                if (onPreview && aircraft) onPreview(aircraft.id, { aircraftType: value })
                                onUpdate(aircraft!.id, { aircraftType: value })
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                {AIRCRAFT_TYPES.map((def) => (
                                    <SelectItem key={def.id} value={def.id}>
                                        <div className="flex flex-col items-start">
                                            <span className="font-medium">{def.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {def.description} • {def.wingspan}ft × {def.length}ft
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-4">
                        <div className="flex justify-between">
                            <Label>Orientation</Label>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <div className="relative w-48 h-48">
                                {/* Compass Circle */}
                                <div
                                    className="absolute inset-0 rounded-full border-4 border-muted flex items-center justify-center cursor-pointer bg-muted/10 overflow-hidden"
                                    onMouseDown={(e) => {
                                        setIsDragging(true)
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const centerX = rect.left + rect.width / 2
                                        const centerY = rect.top + rect.height / 2

                                        const handleMouseMove = (moveEvent: MouseEvent) => {
                                            const x = moveEvent.clientX - centerX
                                            const y = moveEvent.clientY - centerY
                                            // Calculate visual angle (0 at top)
                                            let visualDeg = (Math.atan2(y, x) * 180 / Math.PI) + 90
                                            if (visualDeg < 0) visualDeg += 360

                                            // Adjust for Map Rotation
                                            // True Heading = Visual Angle + Map Rotation
                                            let trueHeading = visualDeg + mapRotation
                                            if (trueHeading < 0) trueHeading += 360
                                            if (trueHeading >= 360) trueHeading -= 360

                                            const roundedDeg = Math.round(trueHeading)

                                            // Update smoothly
                                            updateCompassRotation(roundedDeg)

                                            setRotation(roundedDeg)

                                            if (onPreview && aircraft) {
                                                onPreview(aircraft.id, { rotation: roundedDeg })
                                            }
                                        }

                                        const handleMouseUp = (upEvent: MouseEvent) => {
                                            setIsDragging(false)
                                            const x = upEvent.clientX - centerX
                                            const y = upEvent.clientY - centerY
                                            let visualDeg = (Math.atan2(y, x) * 180 / Math.PI) + 90
                                            if (visualDeg < 0) visualDeg += 360

                                            let trueHeading = visualDeg + mapRotation
                                            if (trueHeading < 0) trueHeading += 360
                                            if (trueHeading >= 360) trueHeading -= 360

                                            const roundedDeg = Math.round(trueHeading)

                                            if (aircraft) {
                                                onUpdate(aircraft.id, { rotation: roundedDeg })
                                            }
                                            document.removeEventListener('mousemove', handleMouseMove)
                                            document.removeEventListener('mouseup', handleMouseUp)
                                        }

                                        document.addEventListener('mousemove', handleMouseMove)
                                        document.addEventListener('mouseup', handleMouseUp)

                                        // Initial click update
                                        handleMouseMove(e as any)
                                    }}
                                >
                                    {/* Map Up Radius (Visual 0) */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-1/2 bg-blue-500/30 origin-bottom pointer-events-none" />

                                    {/* Map Up Label */}
                                    <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-blue-500 z-10 bg-background/80 px-1 rounded">Map Up</span>

                                    {/* Rotated Cardinal Directions Container */}
                                    {/* North Visual: We want +40 deg relative to Map Up (320). 
                                        If mapRotation is 320, we want +40. 
                                        360 - 320 = 40. 
                                        So `360 - mapRotation` should work. 
                                    */}
                                    <div className="absolute inset-0 pointer-events-none" style={{ transform: `rotate(-${mapRotation}deg)` }}>
                                        {/* Radii */}
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-muted-foreground/20" />
                                        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-px bg-muted-foreground/20" />

                                        {/* Labels */}
                                        {/* N moved down to top-8 to be below Red Arrow */}
                                        <span className="absolute top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground bg-background/50 px-0.5 rounded">N</span>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground bg-background/50 px-0.5 rounded">E</span>
                                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground bg-background/50 px-0.5 rounded">S</span>
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground bg-background/50 px-0.5 rounded">W</span>

                                        {/* North Arrow (Red) */}
                                        <div className="absolute top-2 left-1/2 -translate-x-1/2 -translate-y-1">
                                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] border-b-red-600" />
                                        </div>
                                    </div>


                                    {/* Aircraft Icon / Needle */}
                                    {/* Visual Rotation = True Heading - Map Rotation */}
                                    <div
                                        ref={compassPlaneRef}
                                        className="w-full h-full flex items-center justify-center"
                                    // Transform is handled entirely by Ref to support cumulative rotation without React resetting it
                                    >
                                        <div className="relative w-8 h-8 text-primary fill-current drop-shadow-md">
                                            <Plane className="w-full h-full" fill="currentColor" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-center">
                                <Button variant="outline" size="icon" onClick={() => {
                                    // Left relative to Map = 270 + mapRotation
                                    let h = 270 + mapRotation
                                    if (h >= 360) h -= 360
                                    setRotation(h)
                                    updateCompassRotation(h)
                                    if (aircraft) {
                                        if (onPreview) onPreview(aircraft.id, { rotation: h })
                                        onUpdate(aircraft.id, { rotation: h })
                                    }
                                }} title="Face Left (Relative to Map)">
                                    <Plane className="w-4 h-4" style={{ transform: 'rotate(225deg)' }} />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => {
                                    // Top relative to Map = 0 + mapRotation
                                    let h = 0 + mapRotation
                                    if (h >= 360) h -= 360
                                    setRotation(h)
                                    updateCompassRotation(h)
                                    if (aircraft) {
                                        if (onPreview) onPreview(aircraft.id, { rotation: h })
                                        onUpdate(aircraft.id, { rotation: h })
                                    }
                                }} title="Face Top (Relative to Map)">
                                    <Plane className="w-4 h-4" style={{ transform: 'rotate(315deg)' }} />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => {
                                    // Right relative to Map = 90 + mapRotation
                                    let h = 90 + mapRotation
                                    if (h >= 360) h -= 360
                                    setRotation(h)
                                    updateCompassRotation(h)
                                    if (aircraft) {
                                        if (onPreview) onPreview(aircraft.id, { rotation: h })
                                        onUpdate(aircraft.id, { rotation: h })
                                    }
                                }} title="Face Right (Relative to Map)">
                                    <Plane className="w-4 h-4" style={{ transform: 'rotate(45deg)' }} />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => {
                                    // Bottom relative to Map = 180 + mapRotation
                                    let h = 180 + mapRotation
                                    if (h >= 360) h -= 360
                                    setRotation(h)
                                    updateCompassRotation(h)
                                    if (aircraft) {
                                        if (onPreview) onPreview(aircraft.id, { rotation: h })
                                        onUpdate(aircraft.id, { rotation: h })
                                    }
                                }} title="Face Bottom (Relative to Map)">
                                    <Plane className="w-4 h-4" style={{ transform: 'rotate(135deg)' }} />
                                </Button>
                            </div>
                            <div className="text-center text-sm text-muted-foreground">
                                Airplane nose is pointed to heading {rotation}°
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Color</Label>
                        <div className="grid grid-cols-9 gap-2">
                            {[
                                // Row 1: White + Warm/Nature Colors
                                '#ffffff',
                                '#ef4444', // Red
                                '#f97316', // Orange
                                '#f59e0b', // Amber
                                '#eab308', // Yellow
                                '#84cc16', // Lime
                                '#22c55e', // Green
                                '#10b981', // Emerald
                                '#14b8a6', // Teal

                                // Row 2: Black + Cool/Berry Colors
                                '#000000',
                                '#6b7280', // Gray
                                '#06b6d4', // Cyan
                                '#0ea5e9', // Sky
                                '#3b82f6', // Blue
                                '#6366f1', // Indigo
                                '#8b5cf6', // Violet
                                '#a855f7', // Purple
                                '#d946ef'  // Fuchsia
                            ].map((c) => (
                                <button
                                    key={c}
                                    className={`w-8 h-8 rounded-full border ${color === c ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-muted-foreground/50 hover:scale-110 transition-transform'}`}
                                    style={{ backgroundColor: c }}
                                    onClick={() => {
                                        setColor(c)
                                        if (onPreview && aircraft) onPreview(aircraft.id, { color: c })
                                        onUpdate(aircraft.id, { color: c })
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <SheetFooter className="p-4 border-t border-border mt-auto flex-col sm:flex-row gap-2 sm:justify-between items-center bg-muted/20">
                    <Button
                        variant="destructive"
                        onClick={() => {
                            onDelete(aircraft.id)
                            onClose()
                        }}
                        className="w-full sm:w-auto"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Aircraft
                    </Button>
                    <Button onClick={onClose} className="w-full sm:w-auto">
                        Done
                    </Button>
                </SheetFooter>
            </SheetContent >
        </Sheet >
    )
}
