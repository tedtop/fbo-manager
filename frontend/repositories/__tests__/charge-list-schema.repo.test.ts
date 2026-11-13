import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { createTransaction } from '@/repositories/transactions.repo'

// B123 / D24: the charge-list schema on invoices / invoice_line_items.
// The "every existing row becomes legacy" backfill runs once, inside the migration, so it cannot be re-run
// against an empty test database. It was checked by hand on the local stack (rows inserted before the
// migration were all 'legacy' afterwards). These tests cover the resulting contract.

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('charge list schema (B123)', () => {
  it('accepts kind legacy, defaults new rows to visit, and every row has a kind (legacy count + others = total)', async () => {
    const { data: legacy, error } = await db
      .from('invoices')
      .insert({ invoice_number: 'OLD-1', customer_name: 'Old Customer', kind: 'legacy' })
      .select()
      .single()
    expect(error).toBeNull()
    expect(legacy?.kind).toBe('legacy')

    const { data: fresh } = await db
      .from('invoices')
      .insert({ invoice_number: 'NEW-1', customer_name: 'New Customer' })
      .select()
      .single()
    expect(fresh?.kind).toBe('visit')

    const { count: total } = await db.from('invoices').select('*', { count: 'exact', head: true })
    const { count: legacyCount } = await db
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('kind', 'legacy')
    const { count: visitCount } = await db
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('kind', 'visit')
    expect(total).toBe(2)
    expect(legacyCount).toBe(1)
    expect((legacyCount ?? 0) + (visitCount ?? 0)).toBe(total)
  })

  it('rejects an unknown kind', async () => {
    const { error } = await db
      .from('invoices')
      .insert({ customer_name: 'X', kind: 'bogus' as never })
    expect(error?.code).toBe('23514')
  })

  it('inserts an unnumbered list (invoice_number null), several at once', async () => {
    const { data, error } = await db
      .from('invoices')
      .insert([
        { customer_name: 'A', kind: 'visit' },
        { tail_number: 'N123AB', kind: 'counter' },
      ])
      .select()
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(data?.every((r) => r.invoice_number === null)).toBe(true)
  })

  it('refuses a list with neither customer_name nor tail_number', async () => {
    const { error } = await db.from('invoices').insert({ kind: 'visit' })
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('invoices_customer_or_tail_check')
  })

  it('stores the new line columns and keeps source_key unique per invoice', async () => {
    const { data: a } = await db.from('invoices').insert({ tail_number: 'N1' }).select().single()
    const { data: b } = await db.from('invoices').insert({ tail_number: 'N2' }).select().single()
    const line = (invoiceId: number, sourceKey: string) => ({
      invoice_id: invoiceId,
      description: 'Ramp fee',
      source_key: sourceKey,
      unit: 'each',
      waived: true,
      waiver_reason: 'fuel_minimum' as const,
    })

    const first = await db.from('invoice_line_items').insert(line(a!.id, 'ramp:1')).select().single()
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ waived: true, waiver_reason: 'fuel_minimum', unit: 'each', removed_at: null })

    const dup = await db.from('invoice_line_items').insert(line(a!.id, 'ramp:1'))
    expect(dup.error?.code).toBe('23505')

    const otherInvoice = await db.from('invoice_line_items').insert(line(b!.id, 'ramp:1'))
    expect(otherInvoice.error).toBeNull()

    const badReason = await db
      .from('invoice_line_items')
      .insert({ ...line(a!.id, 'ramp:2'), waiver_reason: 'because' as never })
    expect(badReason.error?.code).toBe('23514')
  })

  it('still blocks billing the same fuel_transaction twice', async () => {
    const tx = await createTransaction(db, { ticket_number: 'B123-ONCE', tail_number: 'N116FE' })
    const { data: inv } = await db.from('invoices').insert({ tail_number: 'N116FE' }).select().single()

    const bill = (sourceKey: string) =>
      db.from('invoice_line_items').insert({
        invoice_id: inv!.id,
        description: 'Jet A',
        item_type: 'fuel',
        fuel_transaction_id: tx.id,
        source_key: sourceKey,
      })

    expect((await bill('fuel:a')).error).toBeNull()
    const second = await bill('fuel:b')
    expect(second.error?.code).toBe('23505')
    expect(second.error?.message).toContain('uq_invoice_line_items_fuel_transaction')
  })
})
