'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getApiClient } from '@/lib/api'
import { Card } from '@frontend/ui/components/ui/card'
import { Badge } from '@frontend/ui/components/ui/badge'

type CalendarEvent = {
    type: 'completed' | 'expiry'
    date: string
    fueler_name: string
    training_name: string
}

export default function TrainingCalendarPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login')
    }, [status, router])

    useEffect(() => {
        if (session) fetchEvents()
    }, [session])

    const fetchEvents = async () => {
        try {
            setLoading(true)
            const client = await getApiClient(session)
            // @ts-ignore generated signature returns FuelerTraining but API returns array
            const res = await client.fuelerCertifications.fuelerCertificationsCalendarRetrieve()
            const list: any[] = Array.isArray(res) ? res : res?.results || []
            const mapped: CalendarEvent[] = list.map((e: any) => ({
                type: e.type,
                date: e.date,
                fueler_name: e.fueler_name,
                training_name: e.training_name
            }))
            setEvents(mapped)
        } finally {
            setLoading(false)
        }
    }

    const groups = useMemo(() => {
        const g: Record<string, CalendarEvent[]> = {}
        for (const e of events) {
            const d = new Date(e.date).toISOString().slice(0, 10)
            g[d] = g[d] || []
            g[d].push(e)
        }
        return Object.entries(g).sort(([a], [b]) => (a < b ? -1 : 1))
    }, [events])

    const badgeClass = (t: string) => (t === 'expiry' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-success/10 text-success border-success/20')

    if (status === 'loading' || loading) {
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
                                <div className="font-medium text-foreground">{e.training_name}</div>
                                <div className="text-sm text-muted-foreground">{e.fueler_name}</div>
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
