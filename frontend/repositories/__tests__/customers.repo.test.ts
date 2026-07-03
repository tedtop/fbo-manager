import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { createCustomer, findAllCustomers } from '@/repositories/customers.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('customers.repo', () => {
  it('returns an empty array when no customers exist', async () => {
    expect(await findAllCustomers(db)).toEqual([])
  })

  it('creates a customer and persists it', async () => {
    const created = await createCustomer(db, { name: 'Acme Aviation', customer_type: 'private' })
    expect(created.id).toBeTypeOf('number')
    expect(created.customer_type).toBe('private')
  })

  it('lists customers ordered by name', async () => {
    await createCustomer(db, { name: 'Zulu Charters' })
    await createCustomer(db, { name: 'Alpha Charters' })
    const all = await findAllCustomers(db)
    expect(all.map((c) => c.name)).toEqual(['Alpha Charters', 'Zulu Charters'])
  })
})
