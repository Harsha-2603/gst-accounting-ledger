import { InvoiceLineInput } from '../domain/gstEngine';
export interface CreateInvoiceDTO {
    customerId: string;
    invoiceDate?: string;
    dueDate?: string;
    invoiceNumber?: string;
    deliver?: boolean;
    lines: InvoiceLineInput[];
}
export declare function createInvoice(data: CreateInvoiceDTO): any;
/**
 * Immutable Invoice Reversal Engine (Fix 1 & Killer Test 2)
 * Voids an invoice by writing explicit reversing contra-entries while preserving audit log.
 */
export declare function voidInvoice(invoiceId: string, reason?: string): any;
/**
 * Delivers a draft invoice and posts its double-entry journal vouchers to GL.
 */
export declare function deliverInvoice(invoiceId: string): any;
export declare function getInvoices(filters?: {
    status?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
}): any[];
export declare function getInvoiceById(id: string): any;
