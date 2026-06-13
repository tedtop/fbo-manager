'use client'

import type React from 'react'
import type { PropsWithChildren } from 'react'

export function ErrorMessage({ children }: PropsWithChildren) {
  return (
    <div className="mb-4 rounded bg-destructive/10 border border-destructive/30 px-4 py-3 text-destructive text-sm">
      {children}
    </div>
  )
}
