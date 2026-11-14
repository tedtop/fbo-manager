'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDocs } from '@/providers/docs-provider'
import { CircleHelp } from 'lucide-react'

/**
 * Small "?" button that opens the documentation panel at `anchor` (a registry helpAnchor), or at the top of the
 * module's guide when no anchor is given. Never submits a surrounding form.
 */
export function HelpButton({
  module,
  anchor,
  topic,
  className
}: {
  module: string
  anchor?: string
  /** Names the button for assistive tech and the tooltip: "Help: Quick turn". */
  topic?: string
  className?: string
}) {
  const { openDocs } = useDocs()
  const label = topic ? `Help: ${topic}` : 'Help'
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      data-testid={`help-${anchor ?? 'guide'}`}
      onClick={() => openDocs(module, anchor)}
      className={cn('size-6 text-muted-foreground hover:text-foreground', className)}
    >
      <CircleHelp className="size-4" />
    </Button>
  )
}
