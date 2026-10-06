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
exports.recordPayment = recordPayment;
exports.getPayments = getPayments;
const database_1 = require("../database");
const crypto_1 = __importDefault(require("crypto"));
const decimal_1 = require("../domain/decimal");
const ledgerService = __importStar(require("./ledgerService"));
const errors_1 = require("../errors");
function recordPayment(data) {
    const { customerId, paymentDate, amount, depositAccountId, referenceNumber, allocations } = data;
    if (!customerId) {
        throw new errors_1.BadRequestError('customerId is required.');
    }
    const amtDec = (0, decimal_1.toDec)(amount);
    if (amtDec.lessThanOrEqualTo(0)) {
        throw new errors_1.BadRequestError('Payment amount must be greater than zero.');
    }
    if (!depositAccountId) {
        throw new errors_1.BadRequestError('depositAccountId is required.');
    }
    const depositAcc = database_1.db.prepare('SELECT * FROM accounts WHERE id = ? OR code = ?').get(depositAccountId, depositAccountId);
    if (!depositAcc) {
        throw new errors_1.NotFoundError(`Deposit account '${depositAccountId}' not found in Chart of Accounts.`);
    }
    if (depositAcc.type !== 'ASSET') {
        throw new errors_1.BadRequestError(`Deposit account '${depositAcc.name}' must be of type ASSET (Cash or Bank).`);
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
        throw new errors_1.BadRequestError('Payment allocations array is required.');
    }
    let totalAllocatedDec = (0, decimal_1.toDec)(0);
    allocations.forEach(alloc => {
        totalAllocatedDec = totalAllocatedDec.plus((0, decimal_1.toDec)(alloc.amount));
    });
    if (!amtDec.equals(totalAllocatedDec)) {
        throw new errors_1.BadRequestError(`Sum of allocations (₹${(0, decimal_1.fmtDec)(totalAllocatedDec, 2)}) does not equal total payment amount (₹${(0, decimal_1.fmtDec)(amtDec, 2)}).`);
    }
    const invoiceUpdates = [];
    allocations.forEach(alloc => {
        const invoice = database_1.db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(alloc.invoiceId, alloc.invoiceId);
        if (!invoice) {
            throw new errors_1.NotFoundError(`Invoice '${alloc.invoiceId}' not found.`);
        }
        if (invoice.status === 'VOIDED') {
            throw new errors_1.BadRequestError(`Cannot apply payment to voided invoice '${invoice.invoice_number}'.`);
        }
        const allocAmtDec = (0, decimal_1.toDec)(alloc.amount);
        const dueAmtDec = (0, decimal_1.toDec)(invoice.due_amount);
        if (allocAmtDec.greaterThan(dueAmtDec)) {
            throw new errors_1.BadRequestError(`Allocated amount ₹${(0, decimal_1.fmtDec)(allocAmtDec, 2)} exceeds remaining due balance ₹${(0, decimal_1.fmtDec)(dueAmtDec, 2)} on invoice ${invoice.invoice_number}.`);
        }
        invoiceUpdates.push({ invoice, allocAmtDec });
    });
    const executePayment = () => {
        const now = new Date().toISOString();
        const paymentId = 'pay_' + crypto_1.default.randomUUID().slice(0, 8);
        const count = database_1.db.prepare('SELECT COUNT(*) as cnt FROM payments').get().cnt;
        const paymentNumber = `PAY-${String(count + 1).padStart(4, '0')}`;
        const arAcc = database_1.db.prepare("SELECT id FROM accounts WHERE code = '1200'").get();
        if (!arAcc) {
            throw new Error("Accounts Receivable account (code 1200) not found in Chart of Accounts.");
        }
        const glLines = [
            {
                accountId: depositAcc.id,
                debit: (0, decimal_1.fmtDec)(amtDec),
                credit: '0.0000',
                description: `Customer payment received (${paymentNumber})`
            },
            {
                accountId: arAcc.id,
                debit: '0.0000',
                credit: (0, decimal_1.fmtDec)(amtDec),
                description: `Accounts Receivable relief for payment (${paymentNumber})`
            }
        ];
        const journalEntry = ledgerService.postJournalEntry({
            entryDate: paymentDate || now.slice(0, 10),
            entryType: 'PAYMENT',
            referenceType: 'Payment',
            referenceId: paymentId,
            narration: `Customer payment ${paymentNumber} recorded into ${depositAcc.name}`,
            lines: glLines
        });
        database_1.db.prepare(`
      INSERT INTO payments (
        id, payment_number, customer_id, payment_date, amount,
        deposit_account_id, reference_number, journal_entry_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, paymentNumber, customerId, paymentDate || now.slice(0, 10), (0, decimal_1.fmtDec)(amtDec), depositAcc.id, referenceNumber || '', journalEntry.id, now);
        const insertAlloc = database_1.db.prepare(`
      INSERT INTO payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        const updateInvoiceBal = database_1.db.prepare(`
      UPDATE invoices
      SET paid_amount = ?, due_amount = ?
      WHERE id = ?
    `);
        const settledInvoices = [];
        invoiceUpdates.forEach(({ invoice, allocAmtDec }) => {
            const allocId = 'alloc_' + crypto_1.default.randomUUID().slice(0, 8);
            insertAlloc.run(allocId, paymentId, invoice.id, (0, decimal_1.fmtDec)(allocAmtDec), now);
            const newPaidDec = (0, decimal_1.toDec)(invoice.paid_amount).plus(allocAmtDec);
            const newDueDec = (0, decimal_1.toDec)(invoice.due_amount).minus(allocAmtDec);
            updateInvoiceBal.run((0, decimal_1.fmtDec)(newPaidDec), (0, decimal_1.fmtDec)(newDueDec), invoice.id);
            settledInvoices.push({
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoice_number,
                paidAmount: (0, decimal_1.numVal)(newPaidDec),
                dueAmount: (0, decimal_1.numVal)(newDueDec),
                isFullyPaid: newDueDec.isZero()
            });
        });
        return {
            id: paymentId,
            paymentNumber,
            amount: (0, decimal_1.numVal)(amtDec),
            paymentDate: paymentDate || now.slice(0, 10),
            depositAccountName: depositAcc.name,
            journalEntryId: journalEntry.id,
            settledInvoices
        };
    };
    const txn = database_1.db.transaction(executePayment);
    return txn();
}
function getPayments() {
    const rows = database_1.db.prepare(`
    SELECT 
      p.id,
      p.payment_number as paymentNumber,
      p.customer_id as customerId,
      c.name as customerName,
      p.payment_date as paymentDate,
      p.amount,
      p.deposit_account_id as depositAccountId,
      a.name as depositAccountName,
      p.reference_number as referenceNumber,
      p.journal_entry_id as journalEntryId,
      p.created_at as createdAt
    FROM payments p
    JOIN customers c ON p.customer_id = c.id
    JOIN accounts a ON p.deposit_account_id = a.id
    ORDER BY p.created_at DESC
  `).all();
    return rows.map(p => ({
        ...p,
        amount: (0, decimal_1.numVal)(p.amount)
    }));
}
