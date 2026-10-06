import { db } from '../database';
import crypto from 'crypto';
import { toDec, fmtDec, numVal } from '../domain/decimal';
import { calculateGST, InvoiceLineInput } from '../domain/gstEngine';
import * as ledgerService from './ledgerService';
import { NotFoundError, BadRequestError, ConflictError } from '../errors';

export interface CreateInvoiceDTO {
  customerId: string;
  invoiceDate?: string;
  dueDate?: string;
  invoiceNumber?: string;
  deliver?: boolean;
  lines: InvoiceLineInput[];
}

export function createInvoice(data: CreateInvoiceDTO): any {
  const { customerId, invoiceDate, dueDate, invoiceNumber, deliver = true, lines } = data;

  if (!customerId) {
    throw new BadRequestError('customerId is required.');
  }

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw new BadRequestError('Invoice lines array with at least 1 item is required.');
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    throw new NotFoundError(`Customer ID '${customerId}' not found.`);
  }

  const org = db.prepare('SELECT state_code FROM organization_settings LIMIT 1').get() as any;
  const supplierState = org ? org.state_code : '27';
  const customerState = customer.state_code;

  const gstResult = calculateGST(supplierState, customerState, lines);

  const executeInvoiceCreation = () => {
    const now = new Date().toISOString();
    const invoiceId = 'inv_' + crypto.randomUUID().slice(0, 8);

    let numStr = invoiceNumber;
    if (!numStr) {
      const count = (db.prepare('SELECT COUNT(*) as cnt FROM invoices').get() as any).cnt;
      numStr = `INV-${String(count + 1).padStart(4, '0')}`;
    }

    const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(numStr);
    if (existing) {
      throw new ConflictError(`Invoice number '${numStr}' already exists.`);
    }

    const status = deliver ? 'DELIVERED' : 'DRAFT';
    let journalEntryId: string | null = null;

    if (deliver) {
      const arAcc = db.prepare("SELECT id FROM accounts WHERE code = '1200'").get() as any;
      const salesAcc = db.prepare("SELECT id FROM accounts WHERE code = '4000'").get() as any;
      const cgstAcc = db.prepare("SELECT id FROM accounts WHERE code = '2110'").get() as any;
      const sgstAcc = db.prepare("SELECT id FROM accounts WHERE code = '2120'").get() as any;
      const igstAcc = db.prepare("SELECT id FROM accounts WHERE code = '2130'").get() as any;

      if (!arAcc || !salesAcc || !cgstAcc || !sgstAcc || !igstAcc) {
        throw new Error('Default GST & Sales accounts (1200, 4000, 2110, 2120, 2130) not found in Chart of Accounts.');
      }

      const glLines: any[] = [
        {
          accountId: arAcc.id,
          debit: gstResult.totalAmount,
          credit: '0.0000',
          description: `Accounts Receivable for Invoice ${numStr}`
        },
        {
          accountId: salesAcc.id,
          debit: '0.0000',
          credit: gstResult.subtotal,
          description: `Sales Revenue for Invoice ${numStr}`
        }
      ];

      if (toDec(gstResult.cgstAmount).greaterThan(0)) {
        glLines.push({
          accountId: cgstAcc.id,
          debit: '0.0000',
          credit: gstResult.cgstAmount,
          description: `Output CGST Payable (9%) for Invoice ${numStr}`
        });
      }

      if (toDec(gstResult.sgstAmount).greaterThan(0)) {
        glLines.push({
          accountId: sgstAcc.id,
          debit: '0.0000',
          credit: gstResult.sgstAmount,
          description: `Output SGST Payable (9%) for Invoice ${numStr}`
        });
      }

      if (toDec(gstResult.igstAmount).greaterThan(0)) {
        glLines.push({
          accountId: igstAcc.id,
          debit: '0.0000',
          credit: gstResult.igstAmount,
          description: `Output IGST Payable (18%) for Invoice ${numStr}`
        });
      }

      const postedJournal = ledgerService.postJournalEntry({
        entryDate: invoiceDate || now.slice(0, 10),
        entryType: 'INVOICE',
        referenceType: 'Invoice',
        referenceId: invoiceId,
        narration: `Sales Invoice ${numStr} delivered to ${customer.name}`,
        lines: glLines
      });

      journalEntryId = postedJournal.id;
    }

    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, customer_id, invoice_date, due_date, place_of_supply,
        status, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount,
        paid_amount, due_amount, journal_entry_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0.0000', ?, ?, ?)
    `).run(
      invoiceId,
      numStr,
      customerId,
      invoiceDate || now.slice(0, 10),
      dueDate || invoiceDate || now.slice(0, 10),
      customerState,
      status,
      gstResult.subtotal,
      gstResult.cgstAmount,
      gstResult.sgstAmount,
      gstResult.igstAmount,
      gstResult.totalAmount,
      gstResult.totalAmount,
      journalEntryId,
      now
    );

    const insertLine = db.prepare(`
      INSERT INTO invoice_lines (
        id, invoice_id, item_id, description, hsn_code, quantity, unit_price,
        tax_rate, taxable_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
        igst_rate, igst_amount, total_line_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    gstResult.processedLines.forEach(l => {
      const lineId = 'inv_line_' + crypto.randomUUID().slice(0, 8);
      insertLine.run(
        lineId,
        invoiceId,
        l.itemId || 'item_custom',
        l.description,
        l.hsnCode,
        l.quantity,
        l.unitPrice,
        l.taxRate,
        l.taxableAmount,
        l.cgstRate,
        l.cgstAmount,
        l.sgstRate,
        l.sgstAmount,
        l.igstRate,
        l.igstAmount,
        l.totalLineAmount
      );
    });

    return getInvoiceById(invoiceId);
  };

  const txn = db.transaction(executeInvoiceCreation);
  return txn();
}

/**
 * Immutable Invoice Reversal Engine (Fix 1 & Killer Test 2)
 * Voids an invoice by writing explicit reversing contra-entries while preserving audit log.
 */
export function voidInvoice(invoiceId: string, reason = 'Customer cancellation'): any {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(invoiceId, invoiceId) as any;

  if (!invoice) {
    throw new NotFoundError(`Invoice '${invoiceId}' not found.`);
  }

  if (invoice.status === 'VOIDED') {
    throw new BadRequestError(`Invoice '${invoice.invoice_number}' is already voided.`);
  }

  if (invoice.status !== 'DELIVERED') {
    throw new BadRequestError(`Only delivered invoices can be voided. Current status: ${invoice.status}`);
  }

  if (toDec(invoice.paid_amount).greaterThan(0)) {
    throw new ConflictError(`Cannot void invoice '${invoice.invoice_number}' because payments of ₹${invoice.paid_amount} are attached.`);
  }

  const executeVoid = () => {
    const origLines = db.prepare(`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_entry_id = ?
    `).all(invoice.journal_entry_id) as any[];

    if (origLines.length === 0) {
      throw new Error(`No original journal lines found for invoice '${invoice.invoice_number}'.`);
    }

    const reversingLines = origLines.map(line => ({
      accountId: line.account_id,
      debit: line.credit,   // Swap Credit -> Debit
      credit: line.debit,   // Swap Debit -> Credit
      description: `Reversal: ${line.description || 'Void invoice'}`
    }));

    const now = new Date().toISOString();

    const reversalJournal = ledgerService.postJournalEntry({
      entryDate: now.slice(0, 10),
      entryType: 'REVERSAL',
      referenceType: 'Invoice',
      referenceId: invoice.id,
      narration: `REVERSAL for Voided Invoice ${invoice.invoice_number}: ${reason}`,
      lines: reversingLines
    });

    db.prepare(`
      UPDATE invoices
      SET status = 'VOIDED', due_amount = '0.0000'
      WHERE id = ?
    `).run(invoice.id);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: 'VOIDED',
      dueAmount: 0.00,
      reversalJournalEntryId: reversalJournal.id,
      message: 'Invoice voided successfully; reversing journal entries posted.'
    };
  };

  const txn = db.transaction(executeVoid);
  return txn();
}

export function getInvoices(filters: { status?: string } = {}): any[] {
  let query = `
    SELECT 
      i.id,
      i.invoice_number as invoiceNumber,
      i.customer_id as customerId,
      c.name as customerName,
      c.gstin as customerGstin,
      i.invoice_date as invoiceDate,
      i.due_date as dueDate,
      i.place_of_supply as placeOfSupply,
      i.status,
      i.subtotal,
      i.cgst_amount as cgstAmount,
      i.sgst_amount as sgstAmount,
      i.igst_amount as igstAmount,
      i.total_amount as totalAmount,
      i.paid_amount as paidAmount,
      i.due_amount as dueAmount,
      i.journal_entry_id as journalEntryId,
      i.created_at as createdAt
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.status) {
    query += ` AND i.status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY i.created_at DESC`;

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(inv => ({
    ...inv,
    subtotal: numVal(inv.subtotal),
    cgstAmount: numVal(inv.cgstAmount),
    sgstAmount: numVal(inv.sgstAmount),
    igstAmount: numVal(inv.igstAmount),
    totalAmount: numVal(inv.totalAmount),
    paidAmount: numVal(inv.paidAmount),
    dueAmount: numVal(inv.dueAmount)
  }));
}

export function getInvoiceById(id: string): any {
  const inv = db.prepare(`
    SELECT 
      i.id,
      i.invoice_number as invoiceNumber,
      i.customer_id as customerId,
      c.name as customerName,
      c.gstin as customerGstin,
      c.state_code as customerStateCode,
      i.invoice_date as invoiceDate,
      i.due_date as dueDate,
      i.place_of_supply as placeOfSupply,
      i.status,
      i.subtotal,
      i.cgst_amount as cgstAmount,
      i.sgst_amount as sgstAmount,
      i.igst_amount as igstAmount,
      i.total_amount as totalAmount,
      i.paid_amount as paidAmount,
      i.due_amount as dueAmount,
      i.journal_entry_id as journalEntryId,
      i.created_at as createdAt
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.id = ? OR i.invoice_number = ?
  `).get(id, id) as any;

  if (!inv) return null;

  const lines = db.prepare(`
    SELECT 
      il.id,
      il.item_id as itemId,
      il.description,
      il.hsn_code as hsnCode,
      il.quantity,
      il.unit_price as unitPrice,
      il.tax_rate as taxRate,
      il.taxable_amount as taxableAmount,
      il.cgst_rate as cgstRate,
      il.cgst_amount as cgstAmount,
      il.sgst_rate as sgstRate,
      il.sgst_amount as sgstAmount,
      il.igst_rate as igstRate,
      il.igst_amount as igstAmount,
      il.total_line_amount as totalLineAmount
    FROM invoice_lines il
    WHERE il.invoice_id = ?
  `).all(inv.id) as any[];

  return {
    ...inv,
    subtotal: numVal(inv.subtotal),
    cgstAmount: numVal(inv.cgstAmount),
    sgstAmount: numVal(inv.sgstAmount),
    igstAmount: numVal(inv.igstAmount),
    totalAmount: numVal(inv.totalAmount),
    paidAmount: numVal(inv.paidAmount),
    dueAmount: numVal(inv.dueAmount),
    lines: lines.map(l => ({
      ...l,
      quantity: numVal(l.quantity),
      unitPrice: numVal(l.unitPrice),
      taxRate: numVal(l.taxRate),
      taxableAmount: numVal(l.taxableAmount),
      cgstAmount: numVal(l.cgstAmount),
      sgstAmount: numVal(l.sgstAmount),
      igstAmount: numVal(l.igstAmount),
      totalLineAmount: numVal(l.totalLineAmount)
    }))
  };
}
