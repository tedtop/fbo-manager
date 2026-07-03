'use client'

import { FuelTicketSheet } from '@/components/invoicing/fuel-ticket-sheet'
import { InvoiceDetailDialog } from '@/components/invoicing/invoice-detail-dialog'
import { InvoiceList } from '@/components/invoicing/invoice-list'
import { SettleInvoiceDialog } from '@/components/invoicing/settle-invoice-dialog'
import { formatCurrency } from '@/components/invoicing/ticket-math'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useInvoices } from '@/hooks/use-invoices'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import type {
  InvoiceFilters,
  InvoiceWithItems,
  SettledVia
} from '@/repositories/invoices.repo'
import { Plus, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'

export default function InvoicingPage() {
  const [filters, setFilters] = useState<InvoiceFilters>({ status: 'all' })
  const {
    invoices,
    loading,
    error,
    settleInvoice,
    settling,
    voidInvoice,
    deleteDraft
  } = useInvoices(filters)

  const [ticketOpen, setTicketOpen] = useState(false)
  const [editingDraft, setEditingDraft] = useState<InvoiceWithItems | null>(
    null
  )
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceWithItems | null>(
    null
  )
  const [settlingInvoice, setSettlingInvoice] =
    useState<InvoiceWithItems | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }
  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(''), 4000)
  }

  const summary = useMemo(() => {
    const open = invoices.filter((i) => i.status === 'open')
    const paidToday = invoices.filter(
      (i) =>
        i.status === 'paid' &&
        i.invoice_date === new Date().toISOString().slice(0, 10)
    )
    return {
      onAccountTotal: open.reduce((sum, i) => sum + i.total, 0),
      onAccountCount: open.length,
      paidTodayTotal: paidToday.reduce((sum, i) => sum + i.total, 0),
      paidTodayCount: paidToday.length,
      draftCount: invoices.filter((i) => i.status === 'draft').length
    }
  }, [invoices])

  const openNewTicket = () => {
    setEditingDraft(null)
    setTicketOpen(true)
  }

  const handleEditDraft = (invoice: InvoiceWithItems) => {
    setEditingDraft(invoice)
    setTicketOpen(true)
  }

  const handleSaved = (invoice: InvoiceWithItems, finalized: boolean) => {
    showSuccess(
      finalized
        ? `Ticket #${invoice.invoice_number} completed`
        : `Draft #${invoice.invoice_number} saved`
    )
  }

  const handleSettle = async (
    settledVia: SettledVia,
    reference: string | null
  ) => {
    if (!settlingInvoice) return
    try {
      await settleInvoice({ id: settlingInvoice.id, settledVia, reference })
      showSuccess(`Ticket #${settlingInvoice.invoice_number} settled`)
      setSettlingInvoice(null)
    } catch {
      showError('Failed to record settlement')
    }
  }

  const handleVoid = async (invoice: InvoiceWithItems) => {
    if (
      !confirm(`Void ticket #${invoice.invoice_number}? This cannot be undone.`)
    )
      return
    try {
      await voidInvoice(invoice)
      showSuccess(`Ticket #${invoice.invoice_number} voided`)
    } catch {
      showError('Failed to void ticket')
    }
  }

  const handleDeleteDraft = async (invoice: InvoiceWithItems) => {
    if (
      !confirm(
        `Delete draft #${invoice.invoice_number}? This cannot be undone.`
      )
    )
      return
    try {
      await deleteDraft(invoice)
      showSuccess(`Draft #${invoice.invoice_number} deleted`)
    } catch {
      showError('Failed to delete draft')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Receipt className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Invoicing</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Fuel tickets and service invoices
          </p>
        </div>
        <Button onClick={openNewTicket} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          New ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card px-5 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            On account ({summary.onAccountCount})
          </div>
          <div className="text-2xl font-bold text-amber-500">
            {formatCurrency(summary.onAccountTotal)}
          </div>
        </Card>
        <Card className="border-border bg-card px-5 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Paid today ({summary.paidTodayCount})
          </div>
          <div className="text-2xl font-bold text-green-500">
            {formatCurrency(summary.paidTodayTotal)}
          </div>
        </Card>
        <Card className="border-border bg-card px-5 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Drafts
          </div>
          <div className="text-2xl font-bold text-muted-foreground">
            {summary.draftCount}
          </div>
        </Card>
      </div>

      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
      {error && (
        <Card className="border-destructive/20 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load invoices</p>
        </Card>
      )}

      <InvoiceList
        invoices={invoices}
        loading={loading}
        filters={filters}
        onFiltersChange={setFilters}
        onOpen={setViewingInvoice}
        onEditDraft={handleEditDraft}
        onSettle={setSettlingInvoice}
        onVoid={handleVoid}
        onDeleteDraft={handleDeleteDraft}
      />

      <FuelTicketSheet
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        editingDraft={editingDraft}
        onSaved={handleSaved}
      />

      <InvoiceDetailDialog
        invoice={viewingInvoice}
        onOpenChange={() => setViewingInvoice(null)}
      />

      <SettleInvoiceDialog
        invoice={settlingInvoice}
        onOpenChange={() => setSettlingInvoice(null)}
        onConfirm={handleSettle}
        settling={settling}
      />
    </div>
  )
}
