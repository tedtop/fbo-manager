import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { TrainingSubNav } from '@/components/training/training-sub-nav'

export default function TrainingLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex flex-col gap-6">
            <Suspense fallback={<div className="px-4">Loading...</div>}>
                <TrainingSubNav />
            </Suspense>
            <div className="px-4 md:px-0">{children}</div>
        </div>
    )
}
