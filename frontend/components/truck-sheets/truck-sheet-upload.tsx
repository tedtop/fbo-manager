'use client'

import { useRef, useState } from 'react'
import { Upload, FileImage, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PageStatus = 'queued' | 'extracting' | 'done' | 'error'

export interface PageProgress {
  name: string
  status: PageStatus
  truckNumber?: string
  error?: string
}

interface TruckSheetUploadProps {
  onFiles: (files: File[]) => void
  pages: PageProgress[]
  busy: boolean
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function TruckSheetUpload({ onFiles, pages, busy }: TruckSheetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(list: FileList | null) {
    if (!list) return
    const files = Array.from(list).filter((f) => ACCEPTED.includes(f.type))
    if (files.length > 0) onFiles(files)
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !busy && inputRef.current?.click()}
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
            : 'border-border hover:border-primary/50 hover:bg-muted/30',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
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
            Drop tonight&apos;s truck sheet photos here or click to browse
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Select all pages at once — multi-page trucks are merged automatically
          </div>
        </div>
      </div>

      {pages.length > 0 && (
        <ul className="rounded-lg border border-border divide-y divide-border text-sm">
          {pages.map((page, idx) => (
            <li key={`${page.name}-${idx}`} className="flex items-center gap-3 px-3 py-2">
              {page.status === 'extracting' && (
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              )}
              {page.status === 'queued' && (
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
              )}
              {page.status === 'done' && (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              )}
              {page.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <span className="truncate flex-1">{page.name}</span>
              {page.status === 'done' && page.truckNumber && (
                <span className="text-xs font-mono text-muted-foreground">
                  Truck {page.truckNumber}
                </span>
              )}
              {page.status === 'extracting' && (
                <span className="text-xs text-muted-foreground">Reading with AI…</span>
              )}
              {page.status === 'error' && (
                <span className="text-xs text-destructive truncate max-w-[16rem]">{page.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
