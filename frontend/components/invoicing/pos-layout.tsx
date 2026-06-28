"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InvoiceForm } from "./invoice-form"
import { AutoInvoiceDrawer } from "./auto-invoice-drawer"
import { InvoiceList } from "./invoice-list"

export function PosLayout() {
    return (
        <div className="h-[calc(100vh-4rem)] w-full flex flex-col">
            <Tabs defaultValue="new" className="flex flex-col h-full">
                <div className="border-b px-6 pt-4 shrink-0">
                    <TabsList>
                        <TabsTrigger value="new">New Invoice</TabsTrigger>
                        <TabsTrigger value="from-flight">From Flight</TabsTrigger>
                        <TabsTrigger value="history">Invoice History</TabsTrigger>
                    </TabsList>
                </div>
                <div className="flex-1 overflow-hidden">
                    <TabsContent value="new" className="h-full m-0 data-[state=inactive]:hidden">
                        <InvoiceForm />
                    </TabsContent>
                    <TabsContent value="from-flight" className="h-full m-0 data-[state=inactive]:hidden">
                        <AutoInvoiceDrawer />
                    </TabsContent>
                    <TabsContent value="history" className="h-full m-0 data-[state=inactive]:hidden">
                        <InvoiceList />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
