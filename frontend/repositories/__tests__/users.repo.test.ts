import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeUser } from '@/tests/support/factories'
import { findAllUsers, findUserByEmail, findUserById, updateUser } from '@/repositories/users.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('users.repo', () => {
  it('returns null when a user id does not exist', async () => {
    expect(await findUserById(db, 999_999)).toBeNull()
  })

  it('finds a user by id and never leaks the password column', async () => {
    const user = await makeUser(db, { username: 'alice', email: 'alice@example.com' })
    const found = await findUserById(db, user.id)
    expect(found?.username).toBe('alice')
    expect(found).not.toHaveProperty('password')
  })

  it('finds a user by email', async () => {
    await makeUser(db, { username: 'bob', email: 'bob@example.com' })
    const found = await findUserByEmail(db, 'bob@example.com')
    expect(found?.username).toBe('bob')
  })

  it('returns null for an email with no match', async () => {
    expect(await findUserByEmail(db, 'nobody@example.com')).toBeNull()
  })

  it('lists all users ordered by username', async () => {
    await makeUser(db, { username: 'zack' })
    await makeUser(db, { username: 'amy' })
    const all = await findAllUsers(db)
    expect(all.map((u) => u.username)).toEqual(['amy', 'zack'])
  })

  it('updates a user', async () => {
    const user = await makeUser(db, { username: 'carol', first_name: 'Carol' })
    const updated = await updateUser(db, user.id, { first_name: 'Caroline' })
    expect(updated.first_name).toBe('Caroline')
  })
})
