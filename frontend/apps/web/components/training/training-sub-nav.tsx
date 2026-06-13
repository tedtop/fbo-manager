'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useCertifications } from '@/hooks/use-certifications'
import { Badge } from '@frontend/ui/components/ui/badge'
import { useMemo } from 'react'

interface NavItem {
    name: string
    href: string
    admin?: boolean
}

const baseItems: NavItem[] = [
    { name: 'Overview', href: '/training' },
    { name: 'My Trainings', href: '/training/assigned' },
    { name: 'My Certifications', href: '/training/my' },
    { name: 'Manage Certifications', href: '/training/manage-certifications', admin: true },
    { name: 'Manage Trainings', href: '/training/manage', admin: true },
    { name: 'Types', href: '/training/types', admin: true },
    { name: 'Fuelers', href: '/training/fuelers', admin: true },
    { name: 'Calendar', href: '/training/calendar', admin: true }
]

export function TrainingSubNav() {
    const pathname = usePathname()
    const { user } = useCurrentUser()
    const isAdmin = user?.role === 'admin'
    const isFueler = !!user?.is_active_fueler

    const { certifications } = useCertifications()
    const expiringSoonCount = useMemo(
        () => certifications.filter((c) => ['expired', 'critical', 'warning', 'caution'].includes(c.expiryStatus)).length,
        [certifications]
    )

    return (
        <div className="border-b border-border bg-muted/30 backdrop-blur supports-[backdrop-filter]:bg-muted/50">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-12 items-center gap-6 overflow-x-auto">
                    {baseItems
                        .filter(i => {
                            if (i.name === 'My Trainings' || i.name === 'My Certifications') {
                                return isFueler && !isAdmin
                            }
                            return !i.admin || isAdmin
                        })
                        .map((item) => {
                            const active = pathname === item.href
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`text-sm font-medium whitespace-nowrap flex items-center gap-2 ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    {item.name}
                                    {item.name === 'Overview' && expiringSoonCount > 0 && (
                                        <Badge className="bg-warning/10 text-warning border-warning/20">
                                            {expiringSoonCount} due
                                        </Badge>
                                    )}
                                </Link>
                            )
                        })}
                </div>
            </div>
        </div>
    )
}
