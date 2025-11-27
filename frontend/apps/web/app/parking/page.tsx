'use client'

import { ParkingMapEnhanced } from '@/components/parking/parking-map-enhanced'
import { Button } from '@frontend/ui/components/ui/button'
import { Switch } from '@frontend/ui/components/ui/switch'
import { Label } from '@frontend/ui/components/ui/label'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Settings, Plane } from 'lucide-react'

export default function ParkingManagementPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [configMode, setConfigMode] = useState(false)
  const [isAdmin] = useState(true) // FORCED TRUE FOR NOW

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  // Check if user is admin - DISABLED FOR NOW, forced to true above
  // useEffect(() => {
  //   if (session?.user) {
  //     console.log('Session user data:', session.user)
  //     const userRole = (session.user as any)?.role
  //     const isStaff = (session.user as any)?.is_staff
  //     const isSuperuser = (session.user as any)?.is_superuser
  //     const adminStatus = userRole === 'admin' || isStaff === true || isSuperuser === true
  //     console.log('Admin status:', { userRole, isStaff, isSuperuser, adminStatus })
  //   }
  // }, [session])

  // Show loading while checking auth
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="space-y-6 h-screen flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ramp Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {configMode
              ? 'Configure parking location boundaries'
              : 'Drag aircraft between parking locations'}
          </p>
        </div>

        {/* Admin Toggle */}
        {isAdmin && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-muted-foreground" />
              <Switch
                id="config-mode"
                checked={configMode}
                onCheckedChange={setConfigMode}
              />
              <Settings className="h-4 w-4 text-muted-foreground" />
            </div>
            <Label htmlFor="config-mode" className="text-sm text-foreground">
              {configMode ? 'Config Mode' : 'Operations Mode'}
            </Label>
          </div>
        )}
        {!isAdmin && (
          <div className="text-sm text-destructive">
            Not logged in as admin - login as admin to see Config Mode
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <ParkingMapEnhanced configMode={configMode} isAdmin={isAdmin} />
      </div>

      {/* Help Text */}
      <div className="bg-muted/50 px-6 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {configMode ? (
            <>
              <strong className="text-foreground">Config Mode:</strong> 1) Click "New" in sidebar to create a location. 2) Select it. 3) Click the square polygon tool in top-left. 4) Click on map to draw corners. 5) Double-click to finish. It auto-saves!
            </>
          ) : (
            <>
              {/* TODO: Put back in later
              <strong className="text-foreground">Operations Mode:</strong> Drag aircraft icons to move them
              between parking locations. Toggle Config Mode ON to draw/edit parking spots.
              */}
            </>
          )}
        </p>
      </div>
    </div>
  )
}
