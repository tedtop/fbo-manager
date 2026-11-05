import { PendingAccess } from '@/components/pending-access'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'Waiting for access'
}

export default function PendingPage() {
  return (
    <Suspense>
      <PendingAccess />
    </Suspense>
  )
}
