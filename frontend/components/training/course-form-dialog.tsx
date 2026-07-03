'use client'

import { useTrainings } from '@/hooks/use-trainings'
import type { TrainingRow, TrainingInsert, TrainingUpdate } from '@/repositories/trainings.repo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEffect, useState } from 'react'

interface CourseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  course?: TrainingRow | null
}

const emptyForm = {
  training_name: '',
  description: '',
  validity_period_days: 365,
  aircraft_type: ''
}

export function CourseFormDialog({ open, onOpenChange, course }: CourseFormDialogProps) {
  const { createTraining, updateTraining } = useTrainings()
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(
      course
        ? {
            training_name: course.training_name,
            description: course.description || '',
            validity_period_days: course.validity_period_days,
            aircraft_type: course.aircraft_type || ''
          }
        : emptyForm
    )
  }, [open, course])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload = {
        training_name: form.training_name,
        description: form.description,
        validity_period_days: form.validity_period_days,
        aircraft_type: form.aircraft_type || null
      }
      if (course) {
        await updateTraining(course.id, payload as TrainingUpdate)
      } else {
        await createTraining(payload as TrainingInsert)
      }
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save course')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{course ? 'Edit Course' : 'New Course'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cf-name">Course Name *</Label>
            <Input
              id="cf-name"
              value={form.training_name}
              onChange={(e) => setForm({ ...form, training_name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-desc">Description</Label>
            <Input
              id="cf-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cf-validity">Validity (days) *</Label>
              <Input
                id="cf-validity"
                type="number"
                min={1}
                value={form.validity_period_days}
                onChange={(e) =>
                  setForm({ ...form, validity_period_days: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-ac">Aircraft Type</Label>
              <Input
                id="cf-ac"
                value={form.aircraft_type}
                onChange={(e) => setForm({ ...form, aircraft_type: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.training_name}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
