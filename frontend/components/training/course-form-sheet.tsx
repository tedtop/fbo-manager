'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ErrorMessage } from '@/messages/error-message'
import type {
  TrainingCourseInsert,
  TrainingCourseRow,
  TrainingCourseUpdate,
  ValidityUnit
} from '@/repositories/training-courses.repo'
import { type FormEvent, useEffect, useState } from 'react'

interface CourseFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  course?: TrainingCourseRow | null
  onCreate: (input: TrainingCourseInsert) => Promise<unknown>
  onUpdate: (id: number, updates: TrainingCourseUpdate) => Promise<unknown>
}

const VALIDITY_UNITS: { value: ValidityUnit; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' }
]

interface FormState {
  name: string
  url: string
  instructions: string
  validityAmount: string
  validityUnit: ValidityUnit | 'none'
}

const EMPTY_FORM: FormState = {
  name: '',
  url: '',
  instructions: '',
  validityAmount: '12',
  validityUnit: 'months'
}

export function CourseFormSheet({
  open,
  onOpenChange,
  course,
  onCreate,
  onUpdate
}: CourseFormSheetProps) {
  const isEditing = !!course
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (course) {
      setForm({
        name: course.name,
        url: course.url,
        instructions: course.instructions,
        validityAmount:
          course.validity_amount != null ? String(course.validity_amount) : '',
        validityUnit: course.validity_unit ?? 'none'
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError(null)
  }, [open, course])

  const hasValidity = form.validityUnit !== 'none'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const name = form.name.trim()
    if (!name) {
      setError('Training name is required')
      return
    }

    const amount = hasValidity ? Number(form.validityAmount) : null
    if (hasValidity && (!Number.isFinite(amount) || (amount as number) <= 0)) {
      setError('Validity period must be a positive number')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name,
        url: form.url.trim(),
        instructions: form.instructions.trim(),
        validity_amount: hasValidity ? amount : null,
        validity_unit: hasValidity ? (form.validityUnit as ValidityUnit) : null
      }
      if (isEditing) {
        await onUpdate(course.id, payload)
      } else {
        await onCreate(payload)
      }
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error && /duplicate|unique/i.test(err.message)
          ? 'A training with this name already exists'
          : 'Failed to save training. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEditing ? 'Edit training' : 'Add training'}
            </SheetTitle>
            <SheetDescription>
              {isEditing
                ? 'Update the course details, materials link, and renewal period.'
                : 'Define a new training or certification to track across staff.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-4">
            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="space-y-2">
              <Label htmlFor="course-name">Name</Label>
              <Input
                id="course-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. AvFuel"
                maxLength={100}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="course-url">Training material URL</Label>
              <Input
                id="course-url"
                type="url"
                value={form.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Optional link to the course, manual, or video staff should
                complete.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="course-instructions">Instructions</Label>
              <Textarea
                id="course-instructions"
                value={form.instructions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instructions: e.target.value }))
                }
                placeholder="What staff need to do to complete this training..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Validity period</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={form.validityAmount}
                  disabled={!hasValidity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, validityAmount: e.target.value }))
                  }
                  className="w-24"
                />
                <Select
                  value={form.validityUnit}
                  onValueChange={(value) =>
                    setForm((f) => ({
                      ...f,
                      validityUnit: value as FormState['validityUnit']
                    }))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALIDITY_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="none">Never expires</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                How long a completed training stays current, e.g. &ldquo;12
                months&rdquo;. Changing this only affects future completions.
              </p>
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : isEditing
                  ? 'Save changes'
                  : 'Add training'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
