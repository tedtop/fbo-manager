'use client'

import { ComplianceCell } from '@/components/training/compliance-cell'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { staffDisplayName } from '@/repositories/staff.repo'
import type { ComplianceMatrixData } from '@/services/training.service'
import { formatValidity } from '@/services/training.service'
import {
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Search,
  XCircle
} from 'lucide-react'
import { useMemo, useState } from 'react'

interface ComplianceMatrixProps {
  data: ComplianceMatrixData
  onCellClick: (userId: number, courseId: number) => void
}

const SUMMARY_CONFIG = [
  {
    key: 'expired' as const,
    label: 'Expired',
    icon: XCircle,
    className: 'text-destructive'
  },
  {
    key: 'expiring' as const,
    label: 'Expiring soon',
    icon: AlertTriangle,
    className: 'text-warning'
  },
  {
    key: 'missing' as const,
    label: 'Not completed',
    icon: MinusCircle,
    className: 'text-muted-foreground'
  },
  {
    key: 'current' as const,
    label: 'Current',
    icon: CheckCircle2,
    className: 'text-success'
  }
]

export function ComplianceMatrix({ data, onCellClick }: ComplianceMatrixProps) {
  const [search, setSearch] = useState('')

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data.staff
    return data.staff.filter((s) => {
      const name = staffDisplayName(s).toLowerCase()
      return name.includes(q) || s.title.toLowerCase().includes(q)
    })
  }, [data.staff, search])

  if (data.courses.length === 0) {
    return (
      <Card className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 />
            </EmptyMedia>
            <EmptyTitle>No trainings defined yet</EmptyTitle>
            <EmptyDescription>
              Add your first training or certification to start tracking
              compliance.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  if (data.staff.length === 0) {
    return (
      <Card className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MinusCircle />
            </EmptyMedia>
            <EmptyTitle>No active staff found</EmptyTitle>
            <EmptyDescription>
              Staff are pulled from active department rosters. Add staff to a
              department to see them here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {SUMMARY_CONFIG.map(({ key, label, icon: Icon, className }) => (
          <Badge key={key} variant="outline" className="gap-1.5 px-2.5 py-1">
            <Icon className={cn('size-3.5', className)} />
            <span className="font-semibold">{data.totals[key]}</span>
            <span className="text-muted-foreground font-normal">{label}</span>
          </Badge>
        ))}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff..."
          className="pl-8"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 min-w-[180px] border-b border-r bg-card px-4 py-3 text-left align-bottom font-medium text-muted-foreground">
                  Employee
                </th>
                {data.courses.map((course) => (
                  <th
                    key={course.id}
                    className="sticky top-0 z-10 min-w-[120px] border-b bg-card px-2 py-3 text-center align-bottom font-medium text-muted-foreground"
                  >
                    <span className="block truncate" title={course.name}>
                      {course.name}
                    </span>
                    <span className="block text-[10px] font-normal text-muted-foreground/70">
                      {formatValidity(course)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((staff) => (
                <tr key={staff.userId} className="group/row">
                  <td className="sticky left-0 z-10 border-r bg-card px-4 py-2 group-hover/row:bg-muted/30">
                    <p className="font-medium text-foreground">
                      {staffDisplayName(staff)}
                    </p>
                    {staff.title && (
                      <p className="text-xs text-muted-foreground">
                        {staff.title}
                      </p>
                    )}
                  </td>
                  {data.courses.map((course) => {
                    const cell = data.cells.get(`${staff.userId}:${course.id}`)
                    if (!cell)
                      return <td key={course.id} className="px-1.5 py-1.5" />
                    return (
                      <td key={course.id} className="px-1.5 py-1.5">
                        <ComplianceCell
                          cell={cell}
                          onClick={() => onCellClick(staff.userId, course.id)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
              {filteredStaff.length === 0 && (
                <tr>
                  <td
                    colSpan={data.courses.length + 1}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No staff match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
