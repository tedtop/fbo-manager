'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEquipment } from '@/hooks/use-equipment'

/** Old truck page: a truck's detail now lives under equipment. Sends the truck number to /equipment/<id>. */
export default function TruckRedirectPage({ params }: { params: Promise<{ truckNo: string }> }) {
  const { truckNo: raw } = use(params)
  const truckNo = decodeURIComponent(raw).trim().toUpperCase()
  const router = useRouter()
  const { equipment, loading } = useEquipment()

  useEffect(() => {
    if (loading) return
    const match = equipment.find((e) => e.equipment_id.trim().toUpperCase() === truckNo)
    router.replace(match ? `/equipment/${match.id}` : '/equipment')
  }, [loading, equipment, truckNo, router])

  return <p className="text-sm text-muted-foreground">Redirecting…</p>
}
