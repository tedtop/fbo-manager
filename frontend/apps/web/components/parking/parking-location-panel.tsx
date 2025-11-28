'use client'

import { useState } from 'react'
import { Button } from '@frontend/ui/components/ui/button'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import { Textarea } from '@frontend/ui/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@frontend/ui/components/ui/dialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@frontend/ui/components/ui/card'
import { ScrollArea } from '@frontend/ui/components/ui/scroll-area'
import { PlusCircle, Edit, Trash2 } from 'lucide-react'

interface ParkingLocation {
  id: number
  location_code: string
  description: string
  latitude: string | null
  longitude: string | null
  polygon: number[][] | null
  airport: string
  display_order: number
}

interface ParkingLocationPanelProps {
  locations: ParkingLocation[]
  onCreateLocation: (data: Partial<ParkingLocation>) => Promise<void>
  onUpdateLocation: (
    id: number,
    data: Partial<ParkingLocation>
  ) => Promise<void>
  onDeleteLocation: (id: number) => Promise<void>
  onSelectLocation: (location: ParkingLocation) => void
  selectedLocationId?: number
}

export function ParkingLocationPanel({
  locations,
  onCreateLocation,
  onUpdateLocation,
  onDeleteLocation,
  onSelectLocation,
  selectedLocationId,
}: ParkingLocationPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] =
    useState<ParkingLocation | null>(null)
  const [formData, setFormData] = useState({
    location_code: '',
    description: '',
    airport: 'MSO',
    display_order: 1,
  })

  const handleCreate = () => {
    setEditingLocation(null)
    setFormData({
      location_code: '',
      description: '',
      airport: 'MSO',
      display_order: 1,
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (location: ParkingLocation) => {
    setEditingLocation(location)
    setFormData({
      location_code: location.location_code,
      description: location.description,
      airport: location.airport,
      display_order: location.display_order,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    try {
      if (editingLocation) {
        await onUpdateLocation(editingLocation.id, formData)
      } else {
        await onCreateLocation(formData)
      }
      setIsDialogOpen(false)
    } catch (error) {
      console.error('Failed to save location:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this parking location?')) {
      try {
        await onDeleteLocation(id)
      } catch (error) {
        console.error('Failed to delete location:', error)
      }
    }
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Parking Locations</CardTitle>
              <CardDescription className="text-xs">
                Click to select, draw polygons on map
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleCreate}>
              <PlusCircle className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full px-4 pb-4">
            <div className="space-y-2">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedLocationId === location.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => onSelectLocation(location)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm">
                          {location.location_code}
                        </h4>
                        {location.polygon && (
                          <span className="text-xs text-muted-foreground">
                            📍
                          </span>
                        )}
                      </div>
                      {location.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {location.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(location)
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(location.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? 'Edit' : 'Create'} Parking Location
            </DialogTitle>
            <DialogDescription>
              {editingLocation
                ? 'Update parking location details'
                : 'Create a new parking location. Draw the polygon on the map after saving.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="location_code">Location Code *</Label>
              <Input
                id="location_code"
                placeholder="e.g., T-A1, D-1, BRETZ"
                value={formData.location_code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    location_code: e.target.value.toUpperCase(),
                  })
                }
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Alphanumeric and hyphens only, no spaces
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g., Terminal A Gate 1, North Ramp, Hangar 5"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="airport">Airport</Label>
              <Input
                id="airport"
                value={formData.airport}
                onChange={(e) =>
                  setFormData({ ...formData, airport: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                min="0"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    display_order: parseInt(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                0 = inactive, higher = more popular
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingLocation ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
