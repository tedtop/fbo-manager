import { findActiveProducts } from '@/repositories/products.repo'
import { createTestClient } from '@/tests/support/client'
import { makeProduct } from '@/tests/support/factories'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('products.repo', () => {
  it('excludes inactive products', async () => {
    await makeProduct(db, { name: 'Ramp Fee', is_active: true })
    await makeProduct(db, { name: 'Discontinued Item', is_active: false })

    const active = await findActiveProducts(db)
    expect(active.map((p) => p.name)).toEqual(['Ramp Fee'])
  })

  it('orders by product_type then name', async () => {
    await makeProduct(db, { name: 'Zulu Service', product_type: 'service' })
    await makeProduct(db, { name: 'Alpha Fee', product_type: 'fee' })
    await makeProduct(db, { name: 'Beta Service', product_type: 'service' })

    const all = await findActiveProducts(db)
    expect(all.map((p) => p.name)).toEqual([
      'Alpha Fee',
      'Beta Service',
      'Zulu Service'
    ])
  })
})
