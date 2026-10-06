import { db } from '../database';
import crypto from 'crypto';
import { toDec, fmtDec, numVal } from '../domain/decimal';
import * as ledgerService from './ledgerService';
import { NotFoundError, BadRequestError } from '../errors';

export interface PaymentAllocationInput {
  invoiceId: string;
  amount: number | string;
}

export interface RecordPaymentDTO {
  customerId: string;
  paymentDate?: string;
  amount: number | string;
  depositAccountId: string;
  referenceNumber?: string;
  allocations: PaymentAllocationInput[];
}

export function recordPayment(data: RecordPaymentDTO): any {
  const { customerId, paymentDate, amount, depositAccountId, referenceNumber, allocations } = data;

  if (!customerId) {
    throw new BadRequestError('customerId is required.');
  }

  const amtDec = toDec(amount);
  if (amtDec.lessThanOrEqualTo(0)) {
    throw new BadRequestError('Payment amount must be greater than zero.');
  }

  if (!depositAccountId) {
    throw new BadRequestError('depositAccountId is required.');
  }

  const depositAcc = db.prepare('SELECT * FROM accounts WHERE id = ? OR code = ?').get(depositAccountId, depositAccountId) as any;
  if (!depositAcc) {
    throw new NotFoundError(`Deposit account '${depositAccountId}' not found in Chart of Accounts.`);
  }

  if (depositAcc.type !== 'ASSET') {
    throw new BadRequestError(`Deposit account '${depositAcc.name}' must be of type ASSET (Cash or Bank).`);
  }

  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    throw new BadRequestError('Payment allocations array is required.');
  }

  let totalAllocatedDec = toDec(0);
  allocations.forEach(alloc => {
    totalAllocatedDec = totalAllocatedDec.plus(toDec(alloc.amount));
  });

  if (!amtDec.equals(totalAllocatedDec)) {
    throw new BadRequestError(`Sum of allocations (₹${fmtDec(totalAllocatedDec, 2)}) does not equal total payment amount (₹${fmtDec(amtDec, 2)}).`);
  }

  const invoiceUpdates: { invoice: any; allocAmtDec: any }[] = [];
  allocations.forEach(alloc => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(alloc.invoiceId, alloc.invoiceId) as any;
    if (!invoice) {
      throw new NotFoundError(`Invoice '${alloc.invoiceId}' not found.`);
    }

    if (invoice.status === 'VOIDED') {
      throw new BadRequestError(`Cannot apply payment to voided invoice '${invoice.invoice_number}'.`);
    }

    const allocAmtDec = toDec(alloc.amount);
    const dueAmtDec = toDec(invoice.due_amount);

    if (allocAmtDec.greaterThan(dueAmtDec)) {
      throw new BadRequestError(`Allocated amount ₹${fmtDec(allocAmtDec, 2)} exceeds remaining due balance ₹${fmtDec(dueAmtDec, 2)} on invoice ${invoice.invoice_number}.`);
    }

    invoiceUpdates.push({ invoice, allocAmtDec });
  });

  const executePayment = () => {
    const now = new Date().toISOString();
    const paymentId = 'pay_' + crypto.randomUUID().slice(0, 8);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM payments').get() as any).cnt;
    const paymentNumber = `PAY-${String(count + 1).padStart(4, '0')}`;

    const arAcc = db.prepare("SELECT id FROM accounts WHERE code = '1200'").get() as any;
    if (!arAcc) {
      throw new Error("Accounts Receivable account (code 1200) not found in Chart of Accounts.");
    }

    const glLines = [
      {
        accountId: depositAcc.id,
        debit: fmtDec(amtDec),
        credit: '0.0000',
        description: `Customer payment received (${paymentNumber})`
      },
      {
        accountId: arAcc.id,
        debit: '0.0000',
        credit: fmtDec(amtDec),
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

    db.prepare(`
      INSERT INTO payments (
        id, payment_number, customer_id, payment_date, amount,
        deposit_account_id, reference_number, journal_entry_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      paymentNumber,
      customerId,
      paymentDate || now.slice(0, 10),
      fmtDec(amtDec),
      depositAcc.id,
      referenceNumber || '',
      journalEntry.id,
      now
    );

    const insertAlloc = db.prepare(`
      INSERT INTO payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateInvoiceBal = db.prepare(`
      UPDATE invoices
      SET paid_amount = ?, due_amount = ?
      WHERE id = ?
    `);

    const settledInvoices: any[] = [];

    invoiceUpdates.forEach(({ invoice, allocAmtDec }) => {
      const allocId = 'alloc_' + crypto.randomUUID().slice(0, 8);
      insertAlloc.run(allocId, paymentId, invoice.id, fmtDec(allocAmtDec), now);

      const newPaidDec = toDec(invoice.paid_amount).plus(allocAmtDec);
      const newDueDec = toDec(invoice.due_amount).minus(allocAmtDec);

      updateInvoiceBal.run(fmtDec(newPaidDec), fmtDec(newDueDec), invoice.id);

      settledInvoices.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        paidAmount: numVal(newPaidDec),
        dueAmount: numVal(newDueDec),
        isFullyPaid: newDueDec.isZero()
      });
    });

    return {
      id: paymentId,
      paymentNumber,
      amount: numVal(amtDec),
      paymentDate: paymentDate || now.slice(0, 10),
      depositAccountName: depositAcc.name,
      journalEntryId: journalEntry.id,
      settledInvoices
    };
  };

  const txn = db.transaction(executePayment);
  return txn();
}

export function getPayments(): any[] {
  const rows = db.prepare(`
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
  `).all() as any[];

  return rows.map(p => ({
    ...p,
    amount: numVal(p.amount)
  }));
}
