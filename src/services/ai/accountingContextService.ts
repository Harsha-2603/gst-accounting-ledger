/**
 * Read-Only Accounting Context Service
 * Gathers grounded accounting records strictly through read-only queries.
 * Zero database writes or schema modifications can occur through this service.
 */

import { db } from '../../database';
import * as invoiceService from '../invoiceService';
import * as paymentService from '../paymentService';
import * as reportService from '../reportService';

export interface ReadonlyAccountingContext {
  invoice?: any;
  unpaidInvoices?: any[];
  trialBalance?: any;
  gstSummary?: {
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTax: number;
    invoiceCount: number;
  };
  paymentsSummary?: {
    totalCollected: number;
    paymentCount: number;
    payments: any[];
  };
  journalEntry?: {
    entry: any;
    lines: any[];
    totalDebit: number;
    totalCredit: number;
  };
  sources: string[];
}

/**
 * Searches for invoice by number, ID, or amount match
 */
export function getInvoiceContext(query: string): { invoice: any; sources: string[] } | null {
  const invMatch = query.match(/INV-[\w-]+/i);
  let inv: any = null;

  if (invMatch) {
    const searchedNumber = invMatch[0].toUpperCase();
    inv = invoiceService.getInvoiceById(searchedNumber);
  } else if (query.toLowerCase().includes('invoice')) {
    const amtMatch = query.replace(/,/g, '').match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
    const invoices = invoiceService.getInvoices();
    if (amtMatch) {
      const targetAmt = parseFloat(amtMatch[1]);
      const found = invoices.find((i: any) => Math.abs(i.totalAmount - targetAmt) < 0.01);
      if (found) {
        inv = invoiceService.getInvoiceById(found.id);
      }
    }
    if (!inv && invoices.length > 0) {
      inv = invoiceService.getInvoiceById(invoices[0].id);
    }
  }

  if (!inv) return null;

  const sources = [
    `invoice:${inv.invoiceNumber}`,
    `gst_split:${inv.placeOfSupply}`,
    ...(inv.lines && inv.lines[0] ? [`invoice_lines:${inv.lines[0].itemId}`] : [])
  ];

  return { invoice: inv, sources };
}

/**
 * Gathers outstanding / unpaid invoice context
 */
export function getUnpaidInvoicesContext(): { unpaid: any[]; totalDue: number; sources: string[] } {
  const invoices = invoiceService.getInvoices({ status: 'DELIVERED' });
  const unpaid = invoices.filter((i: any) => i.dueAmount > 0);
  const totalDue = unpaid.reduce((sum: number, i: any) => sum + i.dueAmount, 0);

  return {
    unpaid,
    totalDue,
    sources: ['invoices:unpaid', 'accounts:1200']
  };
}

/**
 * Gathers live Trial Balance equilibrium context
 */
export function getTrialBalanceContext(): { trialBalance: any; sources: string[] } {
  const tb = reportService.getTrialBalance();
  return {
    trialBalance: tb,
    sources: ['report:trial-balance', 'accounts_transactions']
  };
}

/**
 * Gathers live GST tax collection and bifurcation totals
 */
export function getGSTSummaryContext(): {
  gstSummary: {
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTax: number;
    invoiceCount: number;
  };
  sources: string[];
} {
  const invoices = invoiceService.getInvoices({ status: 'DELIVERED' });
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTaxable = 0;

  for (const inv of invoices) {
    totalCgst += inv.cgstAmount || 0;
    totalSgst += inv.sgstAmount || 0;
    totalIgst += inv.igstAmount || 0;
    totalTaxable += inv.subtotal || 0;
  }

  return {
    gstSummary: {
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax: totalCgst + totalSgst + totalIgst,
      invoiceCount: invoices.length
    },
    sources: ['report:gstr-1', 'accounts:2110', 'accounts:2120', 'accounts:2130']
  };
}

/**
 * Gathers customer payments and cash/bank deposits context
 */
export function getPaymentsContext(): {
  paymentsSummary: {
    totalCollected: number;
    paymentCount: number;
    payments: any[];
  };
  sources: string[];
} {
  const payments = paymentService.getPayments();
  const totalCollected = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

  return {
    paymentsSummary: {
      totalCollected,
      paymentCount: payments.length,
      payments
    },
    sources: ['payments:list', 'accounts:1000', 'accounts:1010']
  };
}

/**
 * Gathers journal entry voucher context with line items
 */
export function getJournalEntryContext(query?: string): {
  journalEntry?: {
    entry: any;
    lines: any[];
    totalDebit: number;
    totalCredit: number;
  };
  sources: string[];
} {
  let entry: any = null;

  if (query) {
    const jvMatch = query.match(/JV-[\w-]+/i);
    if (jvMatch) {
      entry = db.prepare('SELECT * FROM journal_entries WHERE entry_number = ?').get(jvMatch[0].toUpperCase());
    }
  }

  if (!entry) {
    entry = db.prepare('SELECT * FROM journal_entries ORDER BY entry_date DESC, id DESC LIMIT 1').get();
  }

  if (!entry) {
    return { sources: ['journal:empty'] };
  }

  const lines = db.prepare(`
    SELECT jl.*, a.code as account_code, a.name as account_name
    FROM journal_lines jl
    JOIN accounts a ON jl.account_id = a.id
    WHERE jl.journal_entry_id = ?
    ORDER BY jl.id ASC
  `).all(entry.id) as any[];

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);

  return {
    journalEntry: {
      entry,
      lines,
      totalDebit,
      totalCredit
    },
    sources: [`journal:${entry.entry_number}`, 'accounts_transactions', `voucher_type:${entry.entry_type}`]
  };
}
