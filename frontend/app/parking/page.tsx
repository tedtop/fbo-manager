'use client'

import { ParkingMap } from '@/components/parking/parking-map'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useSession } from '@/hooks/use-session'
import { Plane, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function ParkingManagementPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [configMode, setConfigMode] = useState(false)
  // Forced on until the admin role exists (backlog item B38 'give the admin a role');
  // then derive it from the user's role.
  const [isAdmin] = useState(true)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

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
          <h1 className="text-3xl font-bold text-foreground">
            Ramp Management
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {configMode
              ? 'Draw and manage the ramp, hangar and tie-down areas'
              : 'Place aircraft on the ramp and drag them into position'}
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
        <ParkingMap configMode={configMode} isAdmin={isAdmin} />
      </div>

      {/* Help Text */}
      <div className="bg-muted/50 px-6 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {configMode ? (
            <>
              <strong className="text-foreground">Config Mode:</strong> 1) Click
              "New area" and name it. 2) Select it in the list (or click it on
              the map). 3) Press "Draw boundary", click each corner on the map
              and double-click to finish the shape (Esc cancels). 4) An area
              with a boundary is editable as soon as you select it: drag a
              corner, drag a midpoint to add one, or drag the shape to move it;
              changes save automatically. "Snap to grid" squares the shape up to
              the map as you see it. Click empty map or press Esc to deselect.
            </>
          ) : (
            <>
              <strong className="text-foreground">Operations Mode:</strong> Use
              "Add airplane" to put an aircraft on the ramp, then drag it into
              place. Click an aircraft for details; with it selected, the arrow
              keys turn and move it and Cmd/Ctrl+Z undoes the last move.
              Right-click the map to set the default view.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
