import { type PlanePose, samePose } from '@/lib/parking-map'

export const UNDO_LIMIT = 20

/** Push a pose to undo back to. Duplicates of the top entry are ignored; oldest entries fall off. */
export function pushPose(
  stack: readonly PlanePose[],
  pose: PlanePose,
  limit = UNDO_LIMIT
): PlanePose[] {
  const top = stack[stack.length - 1]
  if (top && samePose(top, pose)) return [...stack]
  const next = [...stack, pose]
  return next.length > limit ? next.slice(next.length - limit) : next
}

export function popPose(stack: readonly PlanePose[]): {
  stack: PlanePose[]
  pose: PlanePose | null
} {
  if (stack.length === 0) return { stack: [], pose: null }
  return { stack: stack.slice(0, -1), pose: stack[stack.length - 1] }
}
