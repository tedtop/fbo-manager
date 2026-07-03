'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { InvoiceWithItems } from '@/repositories/invoices.repo'
import { InvoicePdf } from './invoice-pdf'

interface InvoiceDetailDialogProps {
  invoice: InvoiceWithItems | null
  onOpenChange: (open: boolean) => void
}

export function InvoiceDetailDialog({
  invoice,
  onOpenChange
}: InvoiceDetailDialogProps) {
  return (
    <Dialog open={invoice != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="no-print">
          <DialogTitle className="sr-only">
            Ticket #{invoice?.invoice_number}
          </DialogTitle>
        </DialogHeader>
        {invoice && <InvoicePdf invoice={invoice} />}
      </DialogContent>
    </Dialog>
  )
}
