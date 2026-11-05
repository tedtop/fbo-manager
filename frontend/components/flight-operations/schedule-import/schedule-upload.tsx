'use client'

import { AlertCircle, Camera, FileImage, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { expandPdfs, isPdfFile } from '@/lib/pdf-to-images'
import { describeError } from '@/lib/error-message'

interface ScheduleUploadProps {
  onFiles: (files: File[]) => void
  busy: boolean
  error: string | null
}

// Phone first: one tap opens the camera (capture), another opens the photo library / file picker. Several photos at once
// are fine (one per page); a PDF holding all pages works too: it is turned into one JPEG per page in the browser
// (the OCR route reads photos only), and images pass through untouched.
export function ScheduleUpload({ onFiles, busy, error }: ScheduleUploadProps) {
  const pickRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [preparing, setPreparing] = useState<string | null>(null)
  const [prepError, setPrepError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handle(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || isPdfFile(f))
    if (files.length === 0) return
    setPrepError(null)
    setNotice(null)
    try {
      const out = await expandPdfs(files, (p) => setPreparing(`Preparing page ${p.page} of ${p.total}…`))
      setPreparing(null)
      if (out.notices.length > 0) setNotice(out.notices.join(' '))
      onFiles(out.files)
    } catch (err) {
      setPreparing(null)
      setPrepError(describeError(err))
    }
  }

  const locked = busy || preparing !== null
  const shownError = prepError ?? error

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-dashed border-border p-5 sm:p-8 flex flex-col items-center gap-4 text-center">
        <FileImage className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div>
          <div className="font-semibold">Scan the schedule sheet</div>
          <div className="text-sm text-muted-foreground mt-1">
            Take a photo of each page, or choose photos or a PDF. Nothing is added until you review it.
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button type="button" className="h-11 sm:h-9" disabled={locked} onClick={() => cameraRef.current?.click()}>
            <Camera className="mr-2 h-4 w-4" /> Take photo
          </Button>
          <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={locked} onClick={() => pickRef.current?.click()}>
            Choose photos or PDF
          </Button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="schedule-camera-input"
          onChange={(e) => {
            handle(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={pickRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          data-testid="schedule-file-input"
          onChange={(e) => {
            handle(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {preparing && (
        <output className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm" aria-live="polite" data-testid="pdf-preparing">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> {preparing}
        </output>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-border px-3 py-3 text-sm" data-testid="pdf-notice">
          {notice}
        </div>
      )}
      {busy && (
        <output className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Reading the sheet… this can take up to a minute.
        </output>
      )}
      {shownError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{shownError}</span>
        </div>
      )}
    </div>
  )
}
