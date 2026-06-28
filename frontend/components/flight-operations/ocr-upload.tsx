'use client'

import { useRef, useState } from 'react'
import { Upload, FileImage, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface OcrUploadProps {
  onFile: (file: File) => void
  loading: boolean
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function OcrUpload({ onFile, loading }: OcrUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<{ name: string; isImage: boolean; url?: string } | null>(null)

  function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) return
    const isImage = file.type.startsWith('image/')
    setPreview({
      name: file.name,
      isImage,
      url: isImage ? URL.createObjectURL(file) : undefined,
    })
    onFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function clear() {
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (preview) {
    return (
      <div className="border border-border rounded-xl bg-card p-4 flex items-center gap-4">
        {preview.url ? (
          <img src={preview.url} alt="Schedule preview" className="h-24 w-24 object-cover rounded-lg border border-border" />
        ) : (
          <div className="h-24 w-24 flex items-center justify-center bg-muted rounded-lg border border-border">
            <FileText className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{preview.name}</div>
          {loading && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Extracting flights with AI…
            </div>
          )}
        </div>
        {!loading && (
          <Button variant="ghost" size="icon" onClick={clear} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      className={cn(
        'border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors',
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex gap-3 text-muted-foreground">
        <FileImage className="w-8 h-8" />
        <Upload className="w-8 h-8" />
        <FileText className="w-8 h-8" />
      </div>
      <div className="text-center">
        <div className="font-semibold text-foreground">Drop schedule here or click to browse</div>
        <div className="text-sm text-muted-foreground mt-1">
          Accepts photos of printed schedules (JPEG, PNG) or PDF files
        </div>
      </div>
    </div>
  )
}
