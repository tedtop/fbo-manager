'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
import type { StaffMember } from '@/repositories/staff.repo'
import { staffDisplayName } from '@/repositories/staff.repo'
import type { TrainingCourseRow } from '@/repositories/training-courses.repo'
import type { CellState, ComplianceStatus } from '@/services/training.service'
import {
  formatValidity,
  validateCertificateFile
} from '@/services/training.service'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MinusCircle,
  Paperclip,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState
} from 'react'

interface CompletionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: StaffMember
  course: TrainingCourseRow
  cell: CellState
  canManage: boolean
  currentUserId: number | null
  onRecord: (input: {
    userId: number
    course: TrainingCourseRow
    completedOn: string
    notes: string
    certificateFile: File | null
    recordedById: number | null
  }) => Promise<unknown>
  onDeleteCompletion: (id: number) => Promise<unknown>
  onGetCertificateUrl: (path: string) => Promise<string>
}

const STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; icon: typeof CheckCircle2; badgeClass: string }
> = {
  current: {
    label: 'Current',
    icon: CheckCircle2,
    badgeClass: 'bg-success/10 text-success border-success/30'
  },
  expiring: {
    label: 'Expiring soon',
    icon: AlertTriangle,
    badgeClass: 'bg-warning/10 text-warning border-warning/30'
  },
  expired: {
    label: 'Expired',
    icon: XCircle,
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/30'
  },
  missing: {
    label: 'Not completed',
    icon: MinusCircle,
    badgeClass: 'bg-muted text-muted-foreground border-border'
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return format(parseISO(iso), 'MMM d, yyyy')
}

export function CompletionSheet({
  open,
  onOpenChange,
  staff,
  course,
  cell,
  canManage,
  currentUserId,
  onRecord,
  onDeleteCompletion,
  onGetCertificateUrl
}: CompletionSheetProps) {
  const [recording, setRecording] = useState(false)
  const [completedOn, setCompletedOn] = useState(() =>
    format(new Date(), 'yyyy-MM-dd')
  )
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvingCertId, setResolvingCertId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setRecording(false)
    setCompletedOn(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')
    setFile(null)
    setError(null)
  }, [open])

  const statusConfig = STATUS_CONFIG[cell.status]
  const StatusIcon = statusConfig.icon

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    if (selected) {
      const invalid = validateCertificateFile(selected)
      if (invalid) {
        setError(invalid)
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
    }
    setError(null)
    setFile(selected)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!completedOn) {
      setError('Completion date is required')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onRecord({
        userId: staff.userId,
        course,
        completedOn,
        notes: notes.trim(),
        certificateFile: file,
        recordedById: currentUserId
      })
      setRecording(false)
    } catch {
      setError('Failed to record completion. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    setError(null)
    try {
      await onDeleteCompletion(id)
    } catch {
      setError('Failed to delete record')
    }
  }

  const handleViewCertificate = async (path: string, id: number) => {
    setResolvingCertId(id)
    try {
      const url = await onGetCertificateUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Failed to open certificate')
    } finally {
      setResolvingCertId(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{course.name}</SheetTitle>
            <SheetDescription>{staffDisplayName(staff)}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-4">
            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <Badge variant="outline" className={statusConfig.badgeClass}>
                <StatusIcon className="size-3.5" />
                {statusConfig.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Valid for {formatValidity(course)}
              </span>
            </div>

            {(course.url || course.instructions) && (
              <div className="space-y-2 text-sm">
                {course.url && (
                  <a
                    href={course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Training material
                  </a>
                )}
                {course.instructions && (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {course.instructions}
                  </p>
                )}
              </div>
            )}

            {!recording && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">
                      {formatDate(cell.latest?.completed_on ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expires</p>
                    <p className="font-medium">
                      {cell.latest?.expires_on
                        ? formatDate(cell.latest.expires_on)
                        : 'Never'}
                    </p>
                  </div>
                </div>

                {cell.latest?.certificate_path && (
                  <button
                    type="button"
                    onClick={() => {
                      const latest = cell.latest
                      if (latest?.certificate_path)
                        handleViewCertificate(
                          latest.certificate_path,
                          latest.id
                        )
                    }}
                    disabled={resolvingCertId === cell.latest.id}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    <Paperclip className="size-3.5" />
                    {resolvingCertId === cell.latest.id
                      ? 'Opening...'
                      : cell.latest.certificate_name || 'View certificate'}
                  </button>
                )}

                <Button
                  type="button"
                  onClick={() => setRecording(true)}
                  className="w-full"
                  variant={cell.status === 'missing' ? 'default' : 'outline'}
                >
                  {cell.status === 'missing'
                    ? 'Record completion'
                    : 'Record renewal'}
                </Button>
              </div>
            )}

            {recording && (
              <form
                onSubmit={handleSubmit}
                className="space-y-4 rounded-lg border p-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="completed-on">Completion date</Label>
                  <Input
                    id="completed-on"
                    type="date"
                    value={completedOn}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setCompletedOn(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="certificate">Certificate</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full justify-start"
                    >
                      <Upload className="size-3.5" />
                      {file ? file.name : 'Upload file (optional)'}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    id="certificate"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <p className="text-xs text-muted-foreground">
                    PDF or image, up to 10 MB.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="completion-notes">Notes</Label>
                  <Textarea
                    id="completion-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRecording(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            )}

            {cell.history.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    History
                  </p>
                  <ul className="space-y-2">
                    {cell.history.map((h) => {
                      const certificatePath = h.certificate_path
                      return (
                        <li
                          key={h.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {formatDate(h.completed_on)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {h.recorded_by
                                ? `by ${staffDisplayName({
                                    firstName: h.recorded_by.first_name,
                                    lastName: h.recorded_by.last_name,
                                    username: h.recorded_by.username
                                  })}`
                                : 'Recorded'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {certificatePath && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  handleViewCertificate(certificatePath, h.id)
                                }
                                title="View certificate"
                              >
                                <Paperclip className="size-3.5" />
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleDelete(h.id)}
                                title="Delete record"
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </>
            )}
          </div>

          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
