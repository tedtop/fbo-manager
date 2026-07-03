'use client'

import { useFuelers } from '@/hooks/use-fuelers'
import { useComplianceMatrix } from '@/hooks/use-training-admin'
import type { TrainingRow } from '@/repositories/trainings.repo'
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

interface AssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  course: TrainingRow | null
}

export function AssignmentDialog({ open, onOpenChange, course }: AssignmentDialogProps) {
  const { fuelers } = useFuelers(true)
  const { assignCourse, isAssigning } = useComplianceMatrix()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedIds([])
    setDueDate('')
    setError(null)
  }, [open])

  const toggle = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!course || selectedIds.length === 0) return
    setError(null)
    try {
      await assignCourse(
        selectedIds.map((fuelerId) => ({
          fueler_id: fuelerId,
          training_id: course.id,
          due_date: dueDate || null
        }))
      )
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign course')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign: {course?.training_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Fuelers *</Label>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border rounded p-2">
              {fuelers.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(f.id)}
                    onChange={() => toggle(f.id)}
                    className="rounded"
                  />
                  {f.fueler_name}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ad-due">Due Date (optional)</Label>
            <Input
              id="ad-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isAssigning || selectedIds.length === 0}>
              {isAssigning
                ? 'Assigning...'
                : `Assign to ${selectedIds.length} fueler${selectedIds.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
