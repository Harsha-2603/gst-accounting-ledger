import assert from 'assert';
import { TestHarness, HttpResponse } from '../harness/testHarness';
import { db } from '../../database';
import { validateJournalBalance } from '../../domain/invariantGuard';
import { calculateGST } from '../../domain/gstEngine';

/**
 * Fixture 1: Balanced Transaction
 * Creates and asserts a balanced double-entry manual journal voucher.
 */
export async function createBalancedTransactionFixture(
  harness: TestHarness,
  options: {
    amount?: number;
    debitAccountId?: string;
    creditAccountId?: string;
    description?: string;
  } = {}
): Promise<{
  entry: any;
  validation: { isBalanced: boolean; difference: string };
}> {
  const amt = options.amount || 11800.0;
  const drAcc = options.debitAccountId || 'acc_ar_1200';
  const crAcc = options.creditAccountId || 'acc_sales_4000';
  const desc = options.description || 'Deterministic Balanced Transaction Fixture';

  const lines = [
    { accountId: drAcc, debit: amt.toFixed(4), credit: '0.0000', description: `${desc} (DR)` },
    { accountId: crAcc, debit: '0.0000', credit: amt.toFixed(4), description: `${desc} (CR)` }
  ];

  const validation = validateJournalBalance(lines);
  assert.strictEqual(validation.isBalanced, true, 'Lines must mathematically balance');
  assert.strictEqual(validation.difference, '0.0000', 'Difference must be exactly 0.0000');

  const res = await harness.request('POST', '/api/transactions', {
    entryDate: new Date().toISOString().split('T')[0],
    entryType: 'MANUAL',
    narration: desc,
    lines
  });

  assert.strictEqual(res.status, 201, `Balanced transaction creation must return 201. Body: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.id, 'Journal entry ID must be returned');

  return { entry: res.body, validation };
}

/**
 * Fixture 2: Intentionally Unbalanced Transaction
 * Attempts to post an unbalanced payload and asserts HTTP 422 rejection, 0 rows written, 0 balance mutations.
 */
export async function createUnbalancedTransactionFixture(
  harness: TestHarness,
  options: {
    debitAmount?: number;
    creditAmount?: number;
  } = {}
): Promise<{
  response: HttpResponse;
  rowsWritten: number;
}> {
  const debitAmt = options.debitAmount || 1180.0;
  const creditAmt = options.creditAmount || 1000.0;

  const lines = [
    { accountId: 'acc_ar_1200', debit: debitAmt.toFixed(4), credit: '0.0000', description: 'Unbalanced Debit' },
    { accountId: 'acc_sales_4000', debit: '0.0000', credit: creditAmt.toFixed(4), description: 'Unbalanced Credit' }
  ];

  const countEntriesBefore = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  const countLinesBefore = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;
  const balancesBefore = db.prepare('SELECT id, balance FROM accounts').all();

  const res = await harness.request('POST', '/api/transactions', {
    entryDate: new Date().toISOString().split('T')[0],
    entryType: 'MANUAL',
    narration: 'Intentionally Unbalanced Fixture Attempt',
    lines
  });

  assert.strictEqual(res.status, 422, `Unbalanced transaction must be rejected with HTTP 422. Got: ${res.status}`);
  assert.strictEqual(res.body.error, 'UNPROCESSABLE_ENTITY');

  const countEntriesAfter = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  const countLinesAfter = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;
  const balancesAfter = db.prepare('SELECT id, balance FROM accounts').all();

  assert.strictEqual(countEntriesBefore, countEntriesAfter, 'Zero rows must be written to journal_entries');
  assert.strictEqual(countLinesBefore, countLinesAfter, 'Zero rows must be written to journal_lines');
  assert.deepStrictEqual(balancesBefore, balancesAfter, 'Zero account balance mutations must occur');

  return {
    response: res,
    rowsWritten: (countEntriesAfter - countEntriesBefore) + (countLinesAfter - countLinesBefore)
  };
}

/**
 * Fixture 3: Intra-State GST Invoice (50% CGST + 50% SGST)
 */
export async function createIntraStateInvoiceFixture(
  harness: TestHarness,
  options: {
    invoiceNumber?: string;
    unitPrice?: number;
    quantity?: number;
    taxRate?: number;
  } = {}
): Promise<{
  invoice: any;
  taxBreakdown: any;
}> {
  const invNumber = options.invoiceNumber || `INV-INTRA-${Date.now().toString().slice(-4)}`;
  const price = options.unitPrice !== undefined ? options.unitPrice : 10000.0;
  const qty = options.quantity !== undefined ? options.quantity : 1;
  const rate = options.taxRate !== undefined ? options.taxRate : 18.0;

  const expectedSubtotal = price * qty;
  const expectedCgst = (expectedSubtotal * (rate / 2)) / 100;
  const expectedSgst = (expectedSubtotal * (rate / 2)) / 100;
  const expectedTotal = expectedSubtotal + expectedCgst + expectedSgst;

  const res = await harness.createInvoice({
    customerId: 'cust_intra_27', // Maharashtra (27) -> Maharashtra (27)
    invoiceNumber: invNumber,
    deliver: true,
    lines: [
      {
        itemId: 'item_pc_8471',
        description: 'Dell PC (Intra-State)',
        hsnCode: '8471',
        quantity: qty,
        unitPrice: price,
        taxRate: rate
      }
    ]
  });

  assert.strictEqual(res.status, 201, `Intra-state invoice must return 201. Got: ${res.status}`);
  const inv = res.body;

  assert.strictEqual(inv.placeOfSupply, '27');
  assert.strictEqual(inv.status, 'DELIVERED');
  assert.strictEqual(inv.subtotal, expectedSubtotal);
  assert.strictEqual(inv.cgstAmount, expectedCgst);
  assert.strictEqual(inv.sgstAmount, expectedSgst);
  assert.strictEqual(inv.igstAmount, 0);
  assert.strictEqual(inv.totalAmount, expectedTotal);
  assert.strictEqual(inv.dueAmount, expectedTotal);
  assert.ok(inv.journalEntryId, 'Journal Entry ID must be present');

  return {
    invoice: inv,
    taxBreakdown: {
      subtotal: expectedSubtotal,
      cgst: expectedCgst,
      sgst: expectedSgst,
      igst: 0,
      total: expectedTotal
    }
  };
}

/**
 * Fixture 4: Inter-State GST Invoice (100% IGST)
 */
export async function createInterStateInvoiceFixture(
  harness: TestHarness,
  options: {
    invoiceNumber?: string;
    unitPrice?: number;
    quantity?: number;
    taxRate?: number;
  } = {}
): Promise<{
  invoice: any;
  taxBreakdown: any;
}> {
  const invNumber = options.invoiceNumber || `INV-INTER-${Date.now().toString().slice(-4)}`;
  const price = options.unitPrice !== undefined ? options.unitPrice : 10000.0;
  const qty = options.quantity !== undefined ? options.quantity : 1;
  const rate = options.taxRate !== undefined ? options.taxRate : 18.0;

  const expectedSubtotal = price * qty;
  const expectedIgst = (expectedSubtotal * rate) / 100;
  const expectedTotal = expectedSubtotal + expectedIgst;

  const res = await harness.createInvoice({
    customerId: 'cust_inter_24', // Gujarat (24) -> Maharashtra (27)
    invoiceNumber: invNumber,
    deliver: true,
    lines: [
      {
        itemId: 'item_pc_8471',
        description: 'Dell PC (Inter-State)',
        hsnCode: '8471',
        quantity: qty,
        unitPrice: price,
        taxRate: rate
      }
    ]
  });

  assert.strictEqual(res.status, 201, `Inter-state invoice must return 201. Got: ${res.status}`);
  const inv = res.body;

  assert.strictEqual(inv.placeOfSupply, '24');
  assert.strictEqual(inv.status, 'DELIVERED');
  assert.strictEqual(inv.subtotal, expectedSubtotal);
  assert.strictEqual(inv.cgstAmount, 0);
  assert.strictEqual(inv.sgstAmount, 0);
  assert.strictEqual(inv.igstAmount, expectedIgst);
  assert.strictEqual(inv.totalAmount, expectedTotal);
  assert.strictEqual(inv.dueAmount, expectedTotal);
  assert.ok(inv.journalEntryId, 'Journal Entry ID must be present');

  return {
    invoice: inv,
    taxBreakdown: {
      subtotal: expectedSubtotal,
      cgst: 0,
      sgst: 0,
      igst: expectedIgst,
      total: expectedTotal
    }
  };
}

/**
 * Fixture 5: Full Payment Settlement
 */
export async function recordFullPaymentFixture(
  harness: TestHarness,
  invoiceId?: string,
  options: {
    customerId?: string;
    depositAccountId?: string;
  } = {}
): Promise<{
  payment: any;
  settledInvoice: any;
}> {
  let targetInvId: string;
  let targetTotal = 0;
  let custId = options.customerId || 'cust_intra_27';

  if (!invoiceId) {
    const created = await createIntraStateInvoiceFixture(harness);
    targetInvId = created.invoice.id;
    targetTotal = created.invoice.totalAmount;
    custId = created.invoice.customerId;
  } else {
    targetInvId = invoiceId;
    const invRes = await harness.request('GET', `/api/invoices/${targetInvId}`);
    assert.strictEqual(invRes.status, 200);
    targetTotal = invRes.body.dueAmount;
    custId = invRes.body.customerId;
  }

  const res = await harness.recordPayment({
    customerId: custId,
    amount: targetTotal,
    depositAccountId: options.depositAccountId || 'acc_bank_1010',
    referenceNumber: `PAY-FULL-${Date.now().toString().slice(-4)}`,
    allocations: [{ invoiceId: targetInvId, amount: targetTotal }]
  });

  assert.strictEqual(res.status, 201, `Full payment must return 201. Got: ${res.status}`);
  const pay = res.body;

  assert.strictEqual(pay.amount, targetTotal);
  assert.ok(pay.settledInvoices && pay.settledInvoices.length > 0);
  const settled = pay.settledInvoices[0];
  assert.strictEqual(settled.isFullyPaid, true);
  assert.strictEqual(settled.dueAmount, 0);

  return { payment: pay, settledInvoice: settled };
}

/**
 * Fixture 6: Partial Payment
 */
export async function recordPartialPaymentFixture(
  harness: TestHarness,
  invoiceId?: string,
  partialAmount?: number,
  options: {
    customerId?: string;
    depositAccountId?: string;
  } = {}
): Promise<{
  payment: any;
  settledInvoice: any;
  remainingDue: number;
}> {
  let targetInvId: string;
  let targetDue = 0;
  let custId = options.customerId || 'cust_intra_27';

  if (!invoiceId) {
    const created = await createIntraStateInvoiceFixture(harness, { unitPrice: 20000 });
    targetInvId = created.invoice.id;
    targetDue = created.invoice.dueAmount;
    custId = created.invoice.customerId;
  } else {
    targetInvId = invoiceId;
    const invRes = await harness.request('GET', `/api/invoices/${targetInvId}`);
    assert.strictEqual(invRes.status, 200);
    targetDue = invRes.body.dueAmount;
    custId = invRes.body.customerId;
  }

  const pAmount = partialAmount || Math.round(targetDue / 2);
  assert.ok(pAmount < targetDue, 'Partial payment amount must be less than total due');

  const res = await harness.recordPayment({
    customerId: custId,
    amount: pAmount,
    depositAccountId: options.depositAccountId || 'acc_bank_1010',
    referenceNumber: `PAY-PART-${Date.now().toString().slice(-4)}`,
    allocations: [{ invoiceId: targetInvId, amount: pAmount }]
  });

  assert.strictEqual(res.status, 201, `Partial payment must return 201. Got: ${res.status}`);
  const pay = res.body;

  const settled = pay.settledInvoices[0];
  assert.strictEqual(settled.isFullyPaid, false);
  const remaining = targetDue - pAmount;
  assert.strictEqual(settled.dueAmount, remaining);

  return { payment: pay, settledInvoice: settled, remainingDue: remaining };
}

/**
 * Fixture 7: Invoice Void / Immutable Reversal
 */
export async function voidInvoiceFixture(
  harness: TestHarness,
  invoiceId?: string,
  options: { reason?: string } = {}
): Promise<{
  voidResponse: any;
  originalLinesCount: number;
  reversalLinesCount: number;
}> {
  let targetInvId: string;

  if (!invoiceId) {
    const created = await createIntraStateInvoiceFixture(harness);
    targetInvId = created.invoice.id;
  } else {
    targetInvId = invoiceId;
  }

  // Count lines before voiding
  const linesBefore = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;

  const res = await harness.voidInvoice(targetInvId, options.reason || 'Fixture Void Test');
  assert.strictEqual(res.status, 200, `Voiding invoice must return 200. Got: ${res.status}`);
  assert.strictEqual(res.body.status, 'VOIDED');
  assert.strictEqual(res.body.dueAmount, 0);
  assert.ok(res.body.reversalJournalEntryId, 'Reversal journal voucher ID must be returned');

  // Verify append-only: lines after must be greater than lines before (zero deletions)
  const linesAfter = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;
  assert.ok(linesAfter > linesBefore, 'Journal lines must increase (append-only contra entries)');

  return {
    voidResponse: res.body,
    originalLinesCount: linesBefore,
    reversalLinesCount: linesAfter - linesBefore
  };
}

/**
 * Fixture 8: Repeated Void Attempt
 * Must safely fail with HTTP 400 Bad Request
 */
export async function repeatedVoidAttemptFixture(
  harness: TestHarness,
  invoiceId: string
): Promise<HttpResponse> {
  const res = await harness.voidInvoice(invoiceId, 'Repeated void attempt');
  assert.strictEqual(res.status, 400, `Repeated void must return 400 Bad Request. Got: ${res.status}`);
  assert.ok(res.body.message && res.body.message.toLowerCase().includes('already voided'));
  return res;
}

/**
 * Fixture 9: Randomized Sequence of 20 Valid Operations
 * Runs 20 varied operations and verifies Trial Balance global & account equilibrium
 */
export async function randomizedSequence20OperationsFixture(
  harness: TestHarness,
  seed: number = 42
): Promise<{
  operationsExecuted: number;
  trialBalance: any;
}> {
  // Reset ledger to a clean starting state
  harness.resetDb();

  const tbInitial = await harness.getTrialBalance();
  assert.strictEqual(tbInitial.body.isBalanced, true);
  assert.strictEqual(tbInitial.body.totalDebit, 0);
  assert.strictEqual(tbInitial.body.totalCredit, 0);

  const activeInvoices: Array<{ id: string; total: number; due: number; isInterState: boolean }> = [];
  let opCount = 0;

  for (let i = 1; i <= 20; i++) {
    const cycle = i % 5;

    if (cycle === 1) {
      // 1. Intra-State Invoice
      const price = 2500 * (Math.floor(i / 5) + 1);
      const inv = await createIntraStateInvoiceFixture(harness, {
        invoiceNumber: `INV-DET-INTRA-${i}-${Date.now().toString().slice(-4)}`,
        unitPrice: price,
        taxRate: 18
      });
      activeInvoices.push({ id: inv.invoice.id, total: inv.invoice.totalAmount, due: inv.invoice.dueAmount, isInterState: false });
      opCount++;
    } else if (cycle === 2) {
      // 2. Inter-State Invoice
      const price = 3000 * (Math.floor(i / 5) + 1);
      const inv = await createInterStateInvoiceFixture(harness, {
        invoiceNumber: `INV-DET-INTER-${i}-${Date.now().toString().slice(-4)}`,
        unitPrice: price,
        taxRate: 12
      });
      activeInvoices.push({ id: inv.invoice.id, total: inv.invoice.totalAmount, due: inv.invoice.dueAmount, isInterState: true });
      opCount++;
    } else if (cycle === 3) {
      // 3. Partial Payment
      const eligible = activeInvoices.find(inv => inv.due > 100);
      if (eligible) {
        const half = Math.round(eligible.due / 2);
        await recordPartialPaymentFixture(harness, eligible.id, half);
        eligible.due -= half;
      } else {
        // Fallback: create & pay
        const inv = await createIntraStateInvoiceFixture(harness);
        await recordPartialPaymentFixture(harness, inv.invoice.id, Math.round(inv.invoice.dueAmount / 2));
      }
      opCount++;
    } else if (cycle === 4) {
      // 4. Full Payment
      const eligible = activeInvoices.find(inv => inv.due > 0);
      if (eligible) {
        await recordFullPaymentFixture(harness, eligible.id);
        eligible.due = 0;
      } else {
        const inv = await createIntraStateInvoiceFixture(harness);
        await recordFullPaymentFixture(harness, inv.invoice.id);
      }
      opCount++;
    } else if (cycle === 0) {
      // 5. Void Invoice (only unpaid invoice)
      const eligible = activeInvoices.find(inv => inv.due === inv.total && inv.due > 0);
      if (eligible) {
        await voidInvoiceFixture(harness, eligible.id);
        eligible.due = 0;
      } else {
        const inv = await createInterStateInvoiceFixture(harness);
        await voidInvoiceFixture(harness, inv.invoice.id);
      }
      opCount++;
    }
  }

  assert.strictEqual(opCount, 20, 'Exactly 20 operations must be executed');

  // Assert Final Trial Balance
  const tbRes = await harness.getTrialBalance();
  assert.strictEqual(tbRes.status, 200);
  const tb = tbRes.body;

  assert.strictEqual(tb.isBalanced, true, 'Trial Balance must be strictly balanced after 20 operations');
  assert.strictEqual(tb.difference, 0, 'Trial Balance difference must be 0.00');
  assert.ok(tb.totalDebit > 0, 'Total debit must be > 0 after transactions');
  assert.strictEqual(tb.totalDebit, tb.totalCredit, 'Grand Total Debit must equal Grand Total Credit');

  return {
    operationsExecuted: opCount,
    trialBalance: tb
  };
}
