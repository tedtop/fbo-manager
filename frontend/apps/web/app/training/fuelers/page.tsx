'use client'

import { useCurrentUser } from '@/hooks/use-current-user'
import { useFuelers } from '@/hooks/use-fuelers'
import { useCertifications } from '@/hooks/use-certifications'
import { Badge } from '@frontend/ui/components/ui/badge'
import { Card } from '@frontend/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@frontend/ui/components/ui/table'
import { useMemo } from 'react'

export default function FuelersTrainingPage() {
    const { user, loading: userLoading } = useCurrentUser()
    const { fuelers, loading: fuelersLoading } = useFuelers()
    const { certifications, loading: certsLoading } = useCertifications()

    const isAdmin = useMemo(() => user?.role === 'admin', [user])

    const certMap = useMemo(() => {
        const map: Record<number, typeof certifications> = {}
        for (const cert of certifications) {
            if (!map[cert.fuelerId]) map[cert.fuelerId] = []
            map[cert.fuelerId].push(cert)
        }
        return map
    }, [certifications])

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

    if (userLoading || fuelersLoading || certsLoading) {
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
                            const certs = certMap[f.id] || []
                            const expired = certs.filter((c) => c.expiryStatus === 'expired').length
                            const expSoon = certs.filter((c) => ['critical', 'warning', 'caution'].includes(c.expiryStatus)).length
                            const valid = certs.filter((c) => c.expiryStatus === 'valid').length
                            const order = ['expired', 'critical', 'warning', 'caution', 'valid']
                            const worst = certs.reduce<string>((acc, c) => {
                                return order.indexOf(c.expiryStatus) < order.indexOf(acc) ? c.expiryStatus : acc
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
