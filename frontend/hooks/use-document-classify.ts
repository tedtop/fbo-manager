'use client'

import type {
  ClassifyResult,
  DocClassification
} from '@/app/api/ocr/classify-document/route'
import { useMutation } from '@tanstack/react-query'

export type { ClassifyResult, DocClassification }

export function useClassifyDocument() {
  return useMutation({
    mutationFn: async (file: File): Promise<ClassifyResult> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr/classify-document', {
        method: 'POST',
        body: form
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? 'Classification failed')
      }
      return res.json()
    }
  })
}
