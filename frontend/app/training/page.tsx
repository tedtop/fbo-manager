'use client'

import { CompletionSheet } from '@/components/training/completion-sheet'
import { ComplianceMatrix } from '@/components/training/compliance-matrix'
import { ManageCoursesPanel } from '@/components/training/manage-courses-panel'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useTrainingMatrix } from '@/hooks/use-training-matrix'
import { ErrorMessage } from '@/messages/error-message'
import { useMemo, useState } from 'react'

export default function TrainingPage() {
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  const {
    matrix,
    allCourses,
    loading,
    error,
    createCourse,
    updateCourse,
    recordCompletion,
    deleteCompletion,
    getCertificateUrl
  } = useTrainingMatrix()

  const [activeCell, setActiveCell] = useState<{
    userId: number
    courseId: number
  } | null>(null)

  const selectedCell = useMemo(() => {
    if (!matrix || !activeCell) return null
    const staff = matrix.staff.find((s) => s.userId === activeCell.userId)
    const course = matrix.courses.find((c) => c.id === activeCell.courseId)
    const cell = matrix.cells.get(`${activeCell.userId}:${activeCell.courseId}`)
    if (!staff || !course || !cell) return null
    return { staff, course, cell }
  }, [matrix, activeCell])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Training &amp; Compliance
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Track certification status and upcoming renewals across your team.
        </p>
      </div>

      {error && (
        <ErrorMessage>
          Failed to load training data. Please refresh the page.
        </ErrorMessage>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && !error && matrix && (
        <Tabs defaultValue="matrix">
          <TabsList>
            <TabsTrigger value="matrix">Compliance matrix</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="manage">Manage trainings</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="matrix" className="pt-4">
            <ComplianceMatrix
              data={matrix}
              onCellClick={(userId, courseId) =>
                setActiveCell({ userId, courseId })
              }
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="manage" className="pt-4">
              <ManageCoursesPanel
                courses={allCourses}
                onCreate={createCourse}
                onUpdate={updateCourse}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      {selectedCell && (
        <CompletionSheet
          open={!!activeCell}
          onOpenChange={(open) => !open && setActiveCell(null)}
          staff={selectedCell.staff}
          course={selectedCell.course}
          cell={selectedCell.cell}
          canManage={isAdmin}
          currentUserId={user?.id ?? null}
          onRecord={recordCompletion}
          onDeleteCompletion={deleteCompletion}
          onGetCertificateUrl={getCertificateUrl}
        />
      )}
    </div>
  )
}
