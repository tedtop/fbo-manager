'use client'

import { CourseFormSheet } from '@/components/training/course-form-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type {
  TrainingCourseInsert,
  TrainingCourseRow,
  TrainingCourseUpdate
} from '@/repositories/training-courses.repo'
import { formatValidity } from '@/services/training.service'
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Pencil,
  Plus
} from 'lucide-react'
import { useState } from 'react'

interface ManageCoursesPanelProps {
  courses: TrainingCourseRow[]
  onCreate: (input: TrainingCourseInsert) => Promise<unknown>
  onUpdate: (id: number, updates: TrainingCourseUpdate) => Promise<unknown>
}

export function ManageCoursesPanel({
  courses,
  onCreate,
  onUpdate
}: ManageCoursesPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<TrainingCourseRow | null>(
    null
  )

  const openCreate = () => {
    setEditingCourse(null)
    setSheetOpen(true)
  }

  const openEdit = (course: TrainingCourseRow) => {
    setEditingCourse(course)
    setSheetOpen(true)
  }

  const toggleActive = (course: TrainingCourseRow) =>
    onUpdate(course.id, { is_active: !course.is_active })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">
            Trainings &amp; certifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Define what appears as a column in the compliance matrix.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus />
          Add training
        </Button>
      </div>

      <Card className="divide-y p-0">
        {courses.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No trainings yet. Add one to get started.
          </p>
        )}
        {courses.map((course) => (
          <div
            key={course.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{course.name}</p>
                {!course.is_active && (
                  <Badge variant="secondary" className="shrink-0">
                    Inactive
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatValidity(course)}</span>
                {course.url && (
                  <a
                    href={course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    Material
                  </a>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => openEdit(course)}
                title="Edit"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => toggleActive(course)}
                title={
                  course.is_active ? 'Retire training' : 'Reactivate training'
                }
              >
                {course.is_active ? (
                  <Archive className="size-4" />
                ) : (
                  <ArchiveRestore className="size-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <CourseFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        course={editingCourse}
        onCreate={onCreate}
        onUpdate={onUpdate}
      />
    </div>
  )
}
