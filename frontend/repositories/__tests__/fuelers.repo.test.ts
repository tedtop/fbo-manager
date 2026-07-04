import {
  createFueler,
  findActiveFuelers,
  findAllFuelers,
  findFuelerById,
  updateFueler
} from '@/repositories/fuelers.repo'
import { createTestClient } from '@/tests/support/client'
import { makeUser } from '@/tests/support/factories'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('fuelers.repo', () => {
  it('returns null for a nonexistent fueler id', async () => {
    expect(await findFuelerById(db, 999_999)).toBeNull()
  })

  it('joins the owning user record on findFuelerById', async () => {
    const user = await makeUser(db, {
      username: 'fueler-user',
      first_name: 'Line'
    })
    const fueler = await createFueler(db, {
      user_id: user.id,
      fueler_name: 'Line Fueler'
    })

    const found = await findFuelerById(db, fueler.id)
    expect(found?.user?.username).toBe('fueler-user')
    expect(found?.user?.first_name).toBe('Line')
  })

  it('fails to create a fueler pointing at a nonexistent user (FK guard)', async () => {
    await expect(
      createFueler(db, { user_id: 999_999, fueler_name: 'Ghost' })
    ).rejects.toThrow()
  })

  it('findActiveFuelers only returns status=active fuelers', async () => {
    const activeUser = await makeUser(db)
    const inactiveUser = await makeUser(db)
    await createFueler(db, {
      user_id: activeUser.id,
      fueler_name: 'Active One',
      status: 'active'
    })
    await createFueler(db, {
      user_id: inactiveUser.id,
      fueler_name: 'Inactive One',
      status: 'inactive'
    })

    const active = await findActiveFuelers(db)
    expect(active.map((f) => f.fueler_name)).toEqual(['Active One'])
  })

  it('lists all fuelers ordered by fueler_name regardless of status', async () => {
    const u1 = await makeUser(db)
    const u2 = await makeUser(db)
    await createFueler(db, {
      user_id: u1.id,
      fueler_name: 'Zed',
      status: 'inactive'
    })
    await createFueler(db, {
      user_id: u2.id,
      fueler_name: 'Amy',
      status: 'active'
    })

    const all = await findAllFuelers(db)
    expect(all.map((f) => f.fueler_name)).toEqual(['Amy', 'Zed'])
  })

  it('updates a fueler', async () => {
    const user = await makeUser(db)
    const fueler = await createFueler(db, {
      user_id: user.id,
      fueler_name: 'Original'
    })
    const updated = await updateFueler(db, fueler.id, {
      fueler_name: 'Renamed'
    })
    expect(updated.fueler_name).toBe('Renamed')
  })
})
