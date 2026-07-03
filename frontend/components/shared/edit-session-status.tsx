'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { UseRecordEditSessionResult } from '@/hooks/use-record-edit-session'
import { RefreshCw, Users } from 'lucide-react'

function formatPeerNames(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

export interface EditSessionStatusProps {
  // biome-ignore lint/suspicious/noExplicitAny: shared across differently-shaped record rows
  editSession: UseRecordEditSessionResult<any>
  /** Called after "Overwrite anyway" completes a save, e.g. to close the Sheet. */
  onOverwriteComplete?: () => void
}

/**
 * Sheet-consistent presence banner + live-change banner + save-conflict dialog for a
 * record edit session. See docs/edit-concurrency.md for the pattern this backs.
 */
export function EditSessionStatus({
  editSession,
  onOverwriteComplete
}: EditSessionStatusProps) {
  const {
    peers,
    remoteChangeDetected,
    dismissRemoteChange,
    conflict,
    resolveConflict,
    reloading
  } = editSession

  return (
    <>
      {peers.length > 0 && (
        <Alert>
          <Users />
          <AlertTitle>
            {formatPeerNames(peers.map((p) => p.name))}{' '}
            {peers.length === 1 ? 'is' : 'are'} also editing this
          </AlertTitle>
          <AlertDescription>
            Changes may conflict if you both save. Coordinate before submitting.
          </AlertDescription>
        </Alert>
      )}

      {remoteChangeDetected && !conflict && (
        <Alert variant="destructive">
          <RefreshCw />
          <AlertTitle>This record was just changed by someone else</AlertTitle>
          <AlertDescription>
            <p>
              Reload to see their changes, or keep editing — you&apos;ll be
              asked again on save.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={reloading}
                onClick={() => resolveConflict('reload')}
              >
                {reloading ? 'Reloading...' : 'Reload'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={dismissRemoteChange}
              >
                Keep editing
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={conflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Someone else saved changes to this record
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your changes are based on an older version. You can reload their
              changes (discarding your edits) or overwrite with your version
              anyway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={reloading}
              onClick={async () => {
                await resolveConflict('overwrite')
                onOverwriteComplete?.()
              }}
            >
              Overwrite anyway
            </Button>
            <Button
              type="button"
              disabled={reloading}
              onClick={() => resolveConflict('reload')}
            >
              {reloading ? 'Reloading...' : 'Reload their changes'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
