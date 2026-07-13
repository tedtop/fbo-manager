'use client'

import type { DocClassification } from '@/hooks/use-document-classify'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  FileQuestion,
  Loader2,
  Upload
} from 'lucide-react'
import { useRef, useState } from 'react'

export type IntakeStatus =
  | 'queued'
  | 'classifying'
  | 'extracting'
  | 'done'
  | 'unrecognized'
  | 'error'

export interface IntakeProgress {
  name: string
  status: IntakeStatus
  docType?: DocClassification
  detail?: string
  error?: string
}

interface IntakeUploadProps {
  onFiles: (files: File[]) => void
  files: IntakeProgress[]
  busy: boolean
}

const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf'
]

const STATUS_LABEL: Record<IntakeStatus, string> = {
  queued: 'Queued',
  classifying: 'Identifying document…',
  extracting: 'Reading with AI…',
  done: 'Extracted',
  unrecognized: 'Not recognized — needs triage',
  error: 'Failed'
}

const DOC_TYPE_LABEL: Record<DocClassification, string> = {
  truck_sheet: 'Truck sheet',
  invoice_slip: 'Invoice slip',
  unrecognized: 'Unrecognized'
}

export function IntakeUpload({ onFiles, files, busy }: IntakeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(list: FileList | null) {
    if (!list) return
    const picked = Array.from(list).filter((f) => ACCEPTED.includes(f.type))
    if (picked.length > 0) onFiles(picked)
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) =>
          e.key === 'Enter' && !busy && inputRef.current?.click()
        }
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!busy) handleFiles(e.dataTransfer.files)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 transition-colors',
          busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="flex gap-3 text-muted-foreground">
          <FileImage className="w-8 h-8" />
          <Upload className="w-8 h-8" />
        </div>
        <div className="text-center">
          <div className="font-semibold text-foreground">
            Drop scanned truck sheets and invoice slips here — mix any
            combination
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Multi-page PDFs (a whole shift/day at once) or individual photos,
            all at once — each file is identified automatically and routed to
            the right review queue
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <ul className="rounded-lg border border-border divide-y divide-border text-sm max-h-96 overflow-y-auto">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}`}
              className="flex items-center gap-3 px-3 py-2"
            >
              {(f.status === 'classifying' || f.status === 'extracting') && (
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              )}
              {f.status === 'queued' && (
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
              )}
              {f.status === 'done' && (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              )}
              {f.status === 'unrecognized' && (
                <FileQuestion className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              {f.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <span className="truncate flex-1">{f.name}</span>
              {f.docType && f.status !== 'unrecognized' && (
                <span className="text-xs font-mono text-muted-foreground">
                  {DOC_TYPE_LABEL[f.docType]}
                </span>
              )}
              {f.detail && f.status === 'done' && (
                <span className="text-xs font-mono text-muted-foreground">
                  {f.detail}
                </span>
              )}
              {f.status === 'error' && f.error && (
                <span className="text-xs text-destructive truncate max-w-[16rem]">
                  {f.error}
                </span>
              )}
              {(f.status === 'classifying' || f.status === 'extracting') && (
                <span className="text-xs text-muted-foreground">
                  {STATUS_LABEL[f.status]}
                </span>
              )}
              {f.status === 'unrecognized' && (
                <span className="text-xs text-amber-400">
                  {STATUS_LABEL[f.status]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
