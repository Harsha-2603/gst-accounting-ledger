"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvoice = createInvoice;
exports.voidInvoice = voidInvoice;
exports.getInvoices = getInvoices;
exports.getInvoiceById = getInvoiceById;
const database_1 = require("../database");
const crypto_1 = __importDefault(require("crypto"));
const decimal_1 = require("../domain/decimal");
const gstEngine_1 = require("../domain/gstEngine");
const ledgerService = __importStar(require("./ledgerService"));
const errors_1 = require("../errors");
function createInvoice(data) {
    const { customerId, invoiceDate, dueDate, invoiceNumber, deliver = true, lines } = data;
    if (!customerId) {
        throw new errors_1.BadRequestError('customerId is required.');
    }
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
        throw new errors_1.BadRequestError('Invoice lines array with at least 1 item is required.');
    }
    const customer = database_1.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
        throw new errors_1.NotFoundError(`Customer ID '${customerId}' not found.`);
    }
    const org = database_1.db.prepare('SELECT state_code FROM organization_settings LIMIT 1').get();
    const supplierState = org ? org.state_code : '27';
    const customerState = customer.state_code;
    const gstResult = (0, gstEngine_1.calculateGST)(supplierState, customerState, lines);
    const executeInvoiceCreation = () => {
        const now = new Date().toISOString();
        const invoiceId = 'inv_' + crypto_1.default.randomUUID().slice(0, 8);
        let numStr = invoiceNumber;
        if (!numStr) {
            const count = database_1.db.prepare('SELECT COUNT(*) as cnt FROM invoices').get().cnt;
            numStr = `INV-${String(count + 1).padStart(4, '0')}`;
        }
        const existing = database_1.db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(numStr);
        if (existing) {
            throw new errors_1.ConflictError(`Invoice number '${numStr}' already exists.`);
        }
        const status = deliver ? 'DELIVERED' : 'DRAFT';
        let journalEntryId = null;
        if (deliver) {
            const arAcc = database_1.db.prepare("SELECT id FROM accounts WHERE code = '1200'").get();
            const salesAcc = database_1.db.prepare("SELECT id FROM accounts WHERE code = '4000'").get();
            const cgstAcc = database_1.db.prepare("SELECT id FROM accounts WHERE code = '2110'").get();
            const sgstAcc = database_1.db.prepare("SELECT id FROM accounts WHERE code = '2120'").get();
            const igstAcc = database_1.db.prepare("SELECT id FROM accounts WHERE code = '2130'").get();
            if (!arAcc || !salesAcc || !cgstAcc || !sgstAcc || !igstAcc) {
                throw new Error('Default GST & Sales accounts (1200, 4000, 2110, 2120, 2130) not found in Chart of Accounts.');
            }
            const glLines = [
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
            if ((0, decimal_1.toDec)(gstResult.cgstAmount).greaterThan(0)) {
                glLines.push({
                    accountId: cgstAcc.id,
                    debit: '0.0000',
                    credit: gstResult.cgstAmount,
                    description: `Output CGST Payable (9%) for Invoice ${numStr}`
                });
            }
            if ((0, decimal_1.toDec)(gstResult.sgstAmount).greaterThan(0)) {
                glLines.push({
                    accountId: sgstAcc.id,
                    debit: '0.0000',
                    credit: gstResult.sgstAmount,
                    description: `Output SGST Payable (9%) for Invoice ${numStr}`
                });
            }
            if ((0, decimal_1.toDec)(gstResult.igstAmount).greaterThan(0)) {
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
        database_1.db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, customer_id, invoice_date, due_date, place_of_supply,
        status, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount,
        paid_amount, due_amount, journal_entry_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0.0000', ?, ?, ?)
    `).run(invoiceId, numStr, customerId, invoiceDate || now.slice(0, 10), dueDate || invoiceDate || now.slice(0, 10), customerState, status, gstResult.subtotal, gstResult.cgstAmount, gstResult.sgstAmount, gstResult.igstAmount, gstResult.totalAmount, gstResult.totalAmount, journalEntryId, now);
        const insertLine = database_1.db.prepare(`
      INSERT INTO invoice_lines (
        id, invoice_id, item_id, description, hsn_code, quantity, unit_price,
        tax_rate, taxable_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
        igst_rate, igst_amount, total_line_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        gstResult.processedLines.forEach(l => {
            const lineId = 'inv_line_' + crypto_1.default.randomUUID().slice(0, 8);
            insertLine.run(lineId, invoiceId, l.itemId || 'item_custom', l.description, l.hsnCode, l.quantity, l.unitPrice, l.taxRate, l.taxableAmount, l.cgstRate, l.cgstAmount, l.sgstRate, l.sgstAmount, l.igstRate, l.igstAmount, l.totalLineAmount);
        });
        return getInvoiceById(invoiceId);
    };
    const txn = database_1.db.transaction(executeInvoiceCreation);
    return txn();
}
/**
 * Immutable Invoice Reversal Engine (Fix 1 & Killer Test 2)
 * Voids an invoice by writing explicit reversing contra-entries while preserving audit log.
 */
function voidInvoice(invoiceId, reason = 'Customer cancellation') {
    const invoice = database_1.db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(invoiceId, invoiceId);
    if (!invoice) {
        throw new errors_1.NotFoundError(`Invoice '${invoiceId}' not found.`);
    }
    if (invoice.status === 'VOIDED') {
        throw new errors_1.BadRequestError(`Invoice '${invoice.invoice_number}' is already voided.`);
    }
    if (invoice.status !== 'DELIVERED') {
        throw new errors_1.BadRequestError(`Only delivered invoices can be voided. Current status: ${invoice.status}`);
    }
    if ((0, decimal_1.toDec)(invoice.paid_amount).greaterThan(0)) {
        throw new errors_1.ConflictError(`Cannot void invoice '${invoice.invoice_number}' because payments of ₹${invoice.paid_amount} are attached.`);
    }
    const executeVoid = () => {
        const origLines = database_1.db.prepare(`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_entry_id = ?
    `).all(invoice.journal_entry_id);
        if (origLines.length === 0) {
            throw new Error(`No original journal lines found for invoice '${invoice.invoice_number}'.`);
        }
        const reversingLines = origLines.map(line => ({
            accountId: line.account_id,
            debit: line.credit, // Swap Credit -> Debit
            credit: line.debit, // Swap Debit -> Credit
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
        database_1.db.prepare(`
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
    const txn = database_1.db.transaction(executeVoid);
    return txn();
}
function getInvoices(filters = {}) {
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
    const params = [];
    if (filters.status) {
        query += ` AND i.status = ?`;
        params.push(filters.status);
    }
    query += ` ORDER BY i.created_at DESC`;
    const rows = database_1.db.prepare(query).all(...params);
    return rows.map(inv => ({
        ...inv,
        subtotal: (0, decimal_1.numVal)(inv.subtotal),
        cgstAmount: (0, decimal_1.numVal)(inv.cgstAmount),
        sgstAmount: (0, decimal_1.numVal)(inv.sgstAmount),
        igstAmount: (0, decimal_1.numVal)(inv.igstAmount),
        totalAmount: (0, decimal_1.numVal)(inv.totalAmount),
        paidAmount: (0, decimal_1.numVal)(inv.paidAmount),
        dueAmount: (0, decimal_1.numVal)(inv.dueAmount)
    }));
}
function getInvoiceById(id) {
    const inv = database_1.db.prepare(`
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
  `).get(id, id);
    if (!inv)
        return null;
    const lines = database_1.db.prepare(`
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
  `).all(inv.id);
    return {
        ...inv,
        subtotal: (0, decimal_1.numVal)(inv.subtotal),
        cgstAmount: (0, decimal_1.numVal)(inv.cgstAmount),
        sgstAmount: (0, decimal_1.numVal)(inv.sgstAmount),
        igstAmount: (0, decimal_1.numVal)(inv.igstAmount),
        totalAmount: (0, decimal_1.numVal)(inv.totalAmount),
        paidAmount: (0, decimal_1.numVal)(inv.paidAmount),
        dueAmount: (0, decimal_1.numVal)(inv.dueAmount),
        lines: lines.map(l => ({
            ...l,
            quantity: (0, decimal_1.numVal)(l.quantity),
            unitPrice: (0, decimal_1.numVal)(l.unitPrice),
            taxRate: (0, decimal_1.numVal)(l.taxRate),
            taxableAmount: (0, decimal_1.numVal)(l.taxableAmount),
            cgstAmount: (0, decimal_1.numVal)(l.cgstAmount),
            sgstAmount: (0, decimal_1.numVal)(l.sgstAmount),
            igstAmount: (0, decimal_1.numVal)(l.igstAmount),
            totalLineAmount: (0, decimal_1.numVal)(l.totalLineAmount)
        }))
    };
}
