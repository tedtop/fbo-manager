'use client'

import { useMyFuelerCertifications } from '@/hooks/use-my-fueler-certifications'
import { useCurrentUser } from '@/hooks/use-current-user'
import { Badge } from '@frontend/ui/components/ui/badge'
import { Card } from '@frontend/ui/components/ui/card'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

function statusBadge(status: string) {
    switch (status) {
        case 'expired':
        case 'critical':
            return 'bg-destructive/10 text-destructive border-destructive/20'
        case 'warning':
        case 'caution':
            return 'bg-warning/10 text-warning border-warning/20'
        default:
            return 'bg-success/10 text-success border-success/20'
    }
}

export default function MyTrainingsPage() {
    const { status, data: session } = useSession()
    const router = useRouter()
    const { user, loading: userLoading } = useCurrentUser()
    const { certifications, loading, error } = useMyFuelerCertifications()

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login')
    }, [status, router])

    const isFueler = !!user?.is_active_fueler || true // page already fetches fueler profile; will gracefully show message if none

    if (status === 'loading' || userLoading || loading) {
        return <div className="p-6 text-muted-foreground">Loading...</div>
    }
    // If no fueler profile resolved certifications array will be empty

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">My Certifications</h1>
                <p className="text-sm text-muted-foreground">Your current certifications and statuses</p>
            </div>

            <Card className="p-4">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-muted-foreground">
                            <th className="text-left font-medium py-2">Training</th>
                            <th className="text-left font-medium py-2">Completed</th>
                            <th className="text-left font-medium py-2">Expiry</th>
                            <th className="text-left font-medium py-2">Days Left</th>
                            <th className="text-left font-medium py-2">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {certifications.map((c) => (
                            <tr key={c.id} className="border-t border-border">
                                <td className="py-2 font-medium">{c.training_name}</td>
                                <td className="py-2 text-muted-foreground">{c.completed_date}</td>
                                <td className="py-2 text-muted-foreground">{c.expiry_date}</td>
                                <td className="py-2">
                                    <span className={`font-semibold ${c.days_until_expiry < 0 ? 'text-destructive' : c.days_until_expiry <= 3 ? 'text-destructive' : c.days_until_expiry <= 7 ? 'text-warning' : 'text-foreground'}`}>
                                        {c.days_until_expiry < 0
                                            ? `${Math.abs(c.days_until_expiry)} days ago`
                                            : `${c.days_until_expiry} days`}
                                    </span>
                                </td>
                                <td className="py-2">
                                    <Badge className={statusBadge(c.expiry_status)}>{c.expiry_status}</Badge>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {certifications.length === 0 && !error && (
                    <div className="text-sm text-muted-foreground py-4">No certifications yet.</div>
                )}
                {error && (
                    <div className="text-sm text-destructive py-4">Failed to load certifications.</div>
                )}
            </Card>
        </div>
    )
}
