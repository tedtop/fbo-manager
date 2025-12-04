'use client'

import { useCurrentUser } from '@/hooks/use-current-user'
import type { Fueler, FuelerTraining } from '@frontend/types/api'
import { Badge } from '@frontend/ui/components/ui/badge'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@frontend/ui/components/ui/table'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getApiClient } from '@/lib/api'

export default function FuelersTrainingPage() {
    const { data: session, status } = useSession()
    const { user, loading: userLoading } = useCurrentUser()
    const router = useRouter()
    const [fuelers, setFuelers] = useState<Fueler[]>([])
    const [loading, setLoading] = useState(true)
    const [certMap, setCertMap] = useState<Record<number, FuelerTraining[]>>({})

    const isAdmin = useMemo(() => user?.role === 'admin', [user])

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login')
    }, [status, router])

    useEffect(() => {
        if (session) fetchData()
    }, [session])

    const fetchData = async () => {
        try {
            setLoading(true)
            const client = await getApiClient(session)
            const res = await client.fuelers.fuelersList()
            const rows = res.results || []
            setFuelers(rows)
            // fetch certifications per fueler to compute status badges
            const entries = await Promise.all(
                rows.map(async (f) => {
                    const resp: any = await client.fuelers.fuelersCertificationsRetrieve(f.id!)
                    const list = (resp?.results || resp || []) as FuelerTraining[]
                    return [f.id!, list] as [number, FuelerTraining[]]
                })
            )
            const map: Record<number, FuelerTraining[]> = {}
            entries.forEach(([id, list]) => (map[id] = list))
            setCertMap(map)
        } catch (e) {
            console.error('Failed loading fuelers or certs', e)
        } finally {
            setLoading(false)
        }
    }

    const statusBadge = (status: string) => {
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

    if (status === 'loading' || userLoading || loading) {
        return <div className="p-6 text-muted-foreground">Loading...</div>
    }
    if (!isAdmin) {
        return <div className="p-6 text-muted-foreground">Admins only</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Fuelers</h1>
                    <p className="text-sm text-muted-foreground">Certification status overview and quick actions</p>
                </div>
            </div>

            <Card className="p-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fueler</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expired</TableHead>
                            <TableHead>Expiring ≤7d</TableHead>
                            <TableHead>Valid</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fuelers.map((f) => {
                            const certs = certMap[f.id!] || []
                            const expired = certs.filter((c) => c.expiry_status === 'expired').length
                            const expSoon = certs.filter((c) => ['critical', 'warning', 'caution'].includes(c.expiry_status as string)).length
                            const valid = certs.filter((c) => c.expiry_status === 'valid').length
                            const worst = certs.reduce<string>((acc, c) => {
                                const order = ['expired', 'critical', 'warning', 'caution', 'valid']
                                return order.indexOf(c.expiry_status as string) < order.indexOf(acc) ? (c.expiry_status as string) : acc
                            }, 'valid')
                            return (
                                <TableRow key={f.id}>
                                    <TableCell className="font-medium">{f.fueler_name}</TableCell>
                                    <TableCell>
                                        <Badge className={statusBadge(worst)}>{worst}</Badge>
                                    </TableCell>
                                    <TableCell>{expired}</TableCell>
                                    <TableCell>{expSoon}</TableCell>
                                    <TableCell>{valid}</TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </Card>
        </div>
    )
}
