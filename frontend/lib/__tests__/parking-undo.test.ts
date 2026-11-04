import { popPose, pushPose } from '@/lib/parking-undo'
import { describe, expect, it } from 'vitest'

const pose = (n: number) => ({ lat: 46 + n * 0.001, lng: -114, heading: n })

describe('parking undo stack', () => {
  it('pops poses newest first', () => {
    let stack = pushPose([], pose(1))
    stack = pushPose(stack, pose(2))
    const first = popPose(stack)
    expect(first.pose).toEqual(pose(2))
    expect(popPose(first.stack).pose).toEqual(pose(1))
  })

  it('returns null and an empty stack when there is nothing to undo', () => {
    expect(popPose([])).toEqual({ stack: [], pose: null })
  })

  it('does not mutate the stack it is given', () => {
    const stack = [pose(1)]
    pushPose(stack, pose(2))
    popPose(stack)
    expect(stack).toEqual([pose(1)])
  })

  it('ignores a pose identical to the newest entry', () => {
    const stack = pushPose(pushPose([], pose(1)), pose(1))
    expect(stack).toHaveLength(1)
  })

  it('drops the oldest entries beyond the limit', () => {
    let stack = [] as ReturnType<typeof pushPose>
    for (let i = 1; i <= 25; i++) stack = pushPose(stack, pose(i), 20)
    expect(stack).toHaveLength(20)
    expect(stack[0]).toEqual(pose(6))
    expect(stack[19]).toEqual(pose(25))
  })
})
