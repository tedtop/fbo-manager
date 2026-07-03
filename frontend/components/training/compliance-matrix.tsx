'use client'

import { useComplianceMatrix } from '@/hooks/use-training-admin'
import { ComplianceCell } from '@/components/training/compliance-cell'
import type { ComplianceCellData } from '@/components/training/compliance-cell'
import type { CompleteCertificationInput } from '@/services/certifications.service'
import { Card } from '@/components/ui/card'

export function ComplianceMatrix() {
  const { data, loading, error, markComplete } = useComplianceMatrix()

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading compliance data...</div>
  }
  if (error) {
    return <div className="text-sm text-destructive p-4">Failed to load compliance data</div>
  }
  if (!data) return null

  const { fuelers, courses, records } = data

  const recordMap = new Map<string, (typeof records)[number]>()
  for (const r of records) {
    recordMap.set(`${r.fueler_id}:${r.training_id}`, r)
  }

  const getCellData = (
    fuelerId: number,
    fuelerName: string,
    courseId: number,
    courseName: string,
    validityDays: number
  ): ComplianceCellData => {
    const rec = recordMap.get(`${fuelerId}:${courseId}`)
    return {
      fuelerId,
      fuelerName,
      trainingId: courseId,
      trainingName: courseName,
      validityDays,
      expiryDate: rec?.expiry_date ?? null,
      completedDate: rec?.completed_date ?? null
    }
  }

  const handleMarkComplete = (input: {
    fuelerId: number
    trainingId: number
    completedDate: string
    expiryDate: string
    certifiedById: null
  }) =>
    markComplete(input as CompleteCertificationInput)

  if (fuelers.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No active fuelers found
      </Card>
    )
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/30 border-b border-border">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground sticky left-0 bg-muted/30 min-w-[160px] z-10">
              Fueler
            </th>
            {courses.map((c) => (
              <th
                key={c.id}
                className="px-2 py-3 font-medium text-muted-foreground text-center min-w-[100px] max-w-[140px]"
              >
                <span className="block truncate text-xs" title={c.training_name}>
                  {c.training_name}
                </span>
                <span className="block text-xs font-normal text-muted-foreground/60">
                  {c.validity_period_days}d
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fuelers.map((f) => (
            <tr key={f.id} className="hover:bg-muted/5">
              <td className="px-4 py-2 font-medium text-foreground sticky left-0 bg-card border-r border-border z-10">
                {f.fueler_name}
              </td>
              {courses.map((c) => (
                <td key={c.id} className="p-1 h-10 text-center">
                  <ComplianceCell
                    data={getCellData(f.id, f.fueler_name, c.id, c.training_name, c.validity_period_days)}
                    onMarkComplete={handleMarkComplete}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
