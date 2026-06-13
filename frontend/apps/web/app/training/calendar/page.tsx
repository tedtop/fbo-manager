'use client'

import { useCertifications } from '@/hooks/use-certifications'
import { Card } from '@frontend/ui/components/ui/card'
import { Badge } from '@frontend/ui/components/ui/badge'
import { useMemo } from 'react'
import type { CertificationDomain } from '@/types/domain/certifications'

type CalendarEvent = {
    type: 'completed' | 'expiry'
    date: string
    fuelerName: string
    trainingName: string
}

export default function TrainingCalendarPage() {
    const { certifications, loading } = useCertifications()

    const events = useMemo<CalendarEvent[]>(() => {
        const result: CalendarEvent[] = []
        for (const c of certifications) {
            result.push({ type: 'completed', date: c.completedDate, fuelerName: c.fuelerName, trainingName: c.trainingName })
            result.push({ type: 'expiry', date: c.expiryDate, fuelerName: c.fuelerName, trainingName: c.trainingName })
        }
        return result
    }, [certifications])

    const groups = useMemo(() => {
        const g: Record<string, CalendarEvent[]> = {}
        for (const e of events) {
            const d = e.date.slice(0, 10)
            g[d] = g[d] || []
            g[d].push(e)
        }
        return Object.entries(g).sort(([a], [b]) => (a < b ? -1 : 1))
    }, [events])

    const badgeClass = (t: string) =>
        t === 'expiry' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-success/10 text-success border-success/20'

    if (loading) {
        return <div className="p-6 text-muted-foreground">Loading...</div>
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Training Calendar</h1>
                <p className="text-sm text-muted-foreground">Completions and upcoming expiries</p>
            </div>

            {groups.map(([day, list]) => (
                <Card key={day} className="p-4">
                    <div className="mb-2 text-sm text-muted-foreground">{new Date(day).toLocaleDateString()}</div>
                    <ul className="space-y-2">
                        {list.map((e, idx) => (
                            <li key={idx} className="flex items-center justify-between">
                                <div className="font-medium text-foreground">{e.trainingName}</div>
                                <div className="text-sm text-muted-foreground">{e.fuelerName}</div>
                                <Badge className={badgeClass(e.type)}>{e.type}</Badge>
                            </li>
                        ))}
                    </ul>
                </Card>
            ))}

            {groups.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">No events in range</Card>
            )}
        </div>
    )
}
