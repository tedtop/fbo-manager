'use client'

import { useCurrentUser } from '@/hooks/use-current-user'
import { useTrainings } from '@/hooks/use-trainings'
import { CourseFormDialog } from '@/components/training/course-form-dialog'
import { AssignmentDialog } from '@/components/training/assignment-dialog'
import { ComplianceMatrix } from '@/components/training/compliance-matrix'
import type { TrainingRow } from '@/repositories/trainings.repo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { useState } from 'react'

export default function TrainingAdminPage() {
  const { user, loading: userLoading } = useCurrentUser()
  const { trainings, loading: trainingsLoading, deleteTraining } = useTrainings()

  const [courseDialogOpen, setCourseDialogOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<TrainingRow | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assigningCourse, setAssigningCourse] = useState<TrainingRow | null>(null)

  const isAdmin = user?.role === 'admin'

  if (userLoading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }
  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">Admins only</div>
  }

  const openCreate = () => {
    setEditingCourse(null)
    setCourseDialogOpen(true)
  }

  const openEdit = (course: TrainingRow) => {
    setEditingCourse(course)
    setCourseDialogOpen(true)
  }

  const openAssign = (course: TrainingRow) => {
    setAssigningCourse(course)
    setAssignDialogOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this course?')) return
    await deleteTraining(id)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Training Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage courses and review fueler compliance
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">Courses</h2>
          <Button onClick={openCreate}>New Course</Button>
        </div>
        <Card className="p-4">
          {trainingsLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : trainings.length === 0 ? (
            <div className="text-sm text-muted-foreground">No courses yet. Create one to get started.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Validity (days)</TableHead>
                  <TableHead>Aircraft Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trainings.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.training_name}</TableCell>
                    <TableCell>{t.validity_period_days}</TableCell>
                    <TableCell>{t.aircraft_type || '—'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openAssign(t)}>
                        Assign
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(t.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Compliance Matrix</h2>
          <p className="text-xs text-muted-foreground mt-1">
            ✅ valid &nbsp;⚠️ expires ≤30 days &nbsp;❌ expired / not certified — click any cell to mark complete
          </p>
        </div>
        <ComplianceMatrix />
      </section>

      <CourseFormDialog
        open={courseDialogOpen}
        onOpenChange={setCourseDialogOpen}
        course={editingCourse}
      />
      <AssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        course={assigningCourse}
      />
    </div>
  )
}
