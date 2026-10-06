import assert from 'assert';
import { TestHarness } from '../harness/testHarness';
import { db } from '../../database';

export async function runApiContractTests(): Promise<{ passed: number; failed: number }> {
  console.log('====================================================');
  console.log('📋 API CONTRACT & INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  const harness = new TestHarness();
  await harness.start();
  harness.resetDb();

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    process.stdout.write(`  ▶ ${name}... `);
    try {
      await fn();
      console.log('✓ PASSED');
      passed++;
    } catch (err: any) {
      console.log(`❌ FAILED\n     Error: ${err.message}`);
      if (err.stack) {
        const stackLine = err.stack.split('\n')[1] || '';
        console.log(`     Location: ${stackLine.trim()}`);
      }
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // 1. HEALTH CHECKS CONTRACT
    // ----------------------------------------------------
    console.log('--- 1. Health & Server Status Endpoints ---');
    await test('GET /health returns 200 OK and database status', async () => {
      const res = await harness.request('GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'OK');
      assert.strictEqual(res.body.database, 'CONNECTED');
    });

    await test('GET /api/health returns 200 OK', async () => {
      const res = await harness.request('GET', '/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'OK');
    });

    // ----------------------------------------------------
    // 2. CHART OF ACCOUNTS (COA) CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 2. Chart of Accounts Endpoints ---');
    await test('GET /api/accounts returns pre-seeded statutory accounts', async () => {
      const res = await harness.request('GET', '/api/accounts');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const codes = res.body.map((a: any) => a.code);
      assert.ok(codes.includes('1000'), 'Must include 1000 (Cash)');
      assert.ok(codes.includes('1010'), 'Must include 1010 (Bank)');
      assert.ok(codes.includes('1200'), 'Must include 1200 (AR)');
      assert.ok(codes.includes('2110'), 'Must include 2110 (CGST)');
      assert.ok(codes.includes('2120'), 'Must include 2120 (SGST)');
      assert.ok(codes.includes('2130'), 'Must include 2130 (IGST)');
      assert.ok(codes.includes('4000'), 'Must include 4000 (Sales)');
    });

    await test('POST /api/accounts creates custom account and enforces unique code', async () => {
      const code = `105${Date.now().toString().slice(-3)}`;
      const res = await harness.request('POST', '/api/accounts', {
        code,
        name: 'Petty Cash Float',
        type: 'ASSET',
        normalBalance: 'DEBIT'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.code, code);

      // Attempt duplicate code creation
      const dupRes = await harness.request('POST', '/api/accounts', {
        code,
        name: 'Duplicate Account',
        type: 'ASSET',
        normalBalance: 'DEBIT'
      });
      assert.strictEqual(dupRes.status, 409, 'Duplicate account code must return 409 Conflict');
    });

    // ----------------------------------------------------
    // 3. CUSTOMER & ITEM CATALOG CONTRACTS
    // ----------------------------------------------------
    console.log('\n--- 3. Customers & Catalog Items Endpoints ---');
    let testCustomerId: string = '';
    await test('POST /api/customers creates new B2B customer with State Code', async () => {
      const res = await harness.createCustomer({
        name: 'Karnataka Trading Corp',
        stateCode: '29',
        gstin: '29AAACK1234F1Z3',
        email: 'billing@karnatakatrading.in',
        phone: '9845012345'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.stateCode, '29');
      assert.ok(res.body.id);
      testCustomerId = res.body.id;
    });

    await test('POST /api/customers rejects payload without name', async () => {
      const res = await harness.request('POST', '/api/customers', { stateCode: '27' });
      assert.strictEqual(res.status, 400);
    });

    let testItemId: string = '';
    await test('POST /api/items creates catalog item with HSN code & tax rate', async () => {
      const res = await harness.createItem({
        name: 'Industrial Ethernet Switch',
        hsnCode: '8517',
        unitPrice: 15000.0,
        defaultTaxRate: 18.0
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.hsnCode, '8517');
      assert.strictEqual(res.body.unitPrice, 15000.0);
      assert.ok(res.body.id);
      testItemId = res.body.id;
    });

    // ----------------------------------------------------
    // 4. INVOICES CONTRACT (Intra, Inter, Draft, Deliver)
    // ----------------------------------------------------
    console.log('\n--- 4. Invoices Contract Endpoints (POST, GET, Void) ---');
    let intraInvoiceId: string = '';
    let intraInvoiceNumber: string = '';

    await test('POST /api/invoices creates and delivers intra-state invoice with 50/50 dual split', async () => {
      intraInvoiceNumber = `INV-INTRA-${Date.now().toString().slice(-4)}`;
      const res = await harness.createInvoice({
        customerId: 'cust_intra_27', // Maharashtra
        invoiceNumber: intraInvoiceNumber,
        deliver: true,
        lines: [
          {
            itemId: 'item_pc_8471',
            description: 'Intra-State Workstation',
            hsnCode: '8471',
            quantity: 2,
            unitPrice: 50000.0,
            taxRate: 18.0
          }
        ]
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, 'DELIVERED');
      assert.strictEqual(res.body.subtotal, 100000.0);
      assert.strictEqual(res.body.cgstAmount, 9000.0);
      assert.strictEqual(res.body.sgstAmount, 9000.0);
      assert.strictEqual(res.body.igstAmount, 0.0);
      assert.strictEqual(res.body.totalAmount, 118000.0);
      assert.strictEqual(res.body.dueAmount, 118000.0);
      assert.ok(res.body.journalEntryId);
      intraInvoiceId = res.body.id;
    });

    let interInvoiceId: string = '';
    await test('POST /api/invoices creates and delivers inter-state invoice with 100% IGST', async () => {
      const invNum = `INV-INTER-${Date.now().toString().slice(-4)}`;
      const res = await harness.createInvoice({
        customerId: testCustomerId, // Karnataka (29) vs Org (27)
        invoiceNumber: invNum,
        deliver: true,
        lines: [
          {
            itemId: testItemId,
            description: 'Inter-State Industrial Switch',
            hsnCode: '8517',
            quantity: 1,
            unitPrice: 15000.0,
            taxRate: 18.0
          }
        ]
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, 'DELIVERED');
      assert.strictEqual(res.body.subtotal, 15000.0);
      assert.strictEqual(res.body.cgstAmount, 0.0);
      assert.strictEqual(res.body.sgstAmount, 0.0);
      assert.strictEqual(res.body.igstAmount, 2700.0);
      assert.strictEqual(res.body.totalAmount, 17700.0);
      interInvoiceId = res.body.id;
    });

    await test('POST /api/invoices rejects duplicate invoice number with 409 Conflict', async () => {
      const res = await harness.createInvoice({
        customerId: 'cust_intra_27',
        invoiceNumber: intraInvoiceNumber, // duplicate!
        deliver: true,
        lines: [{ itemId: 'item_pc_8471', hsnCode: '8471', quantity: 1, unitPrice: 10000, taxRate: 18 }]
      });
      assert.strictEqual(res.status, 409, 'Duplicate invoiceNumber must return 409');
    });

    await test('POST /api/invoices rejects invalid/negative quantities with 400 Bad Request', async () => {
      const res = await harness.createInvoice({
        customerId: 'cust_intra_27',
        invoiceNumber: `INV-NEG-${Date.now()}`,
        lines: [{ itemId: 'item_pc_8471', hsnCode: '8471', quantity: -5, unitPrice: 10000, taxRate: 18 }]
      });
      assert.strictEqual(res.status, 400);
    });

    await test('POST /api/invoices rejects unrecognized GST tax slab with 400 Bad Request', async () => {
      const res = await harness.createInvoice({
        customerId: 'cust_intra_27',
        invoiceNumber: `INV-BAD-TAX-${Date.now()}`,
        lines: [{ itemId: 'item_pc_8471', hsnCode: '8471', quantity: 1, unitPrice: 10000, taxRate: 23 }]
      });
      assert.strictEqual(res.status, 400);
    });

    await test('GET /api/invoices and GET /api/invoices/:id return invoice details with line items', async () => {
      const listRes = await harness.request('GET', '/api/invoices');
      assert.strictEqual(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body));
      assert.ok(listRes.body.length >= 2);

      const singleRes = await harness.request('GET', `/api/invoices/${intraInvoiceId}`);
      assert.strictEqual(singleRes.status, 200);
      assert.strictEqual(singleRes.body.id, intraInvoiceId);
      assert.ok(singleRes.body.lines && singleRes.body.lines.length > 0);
    });

    await test('GET /api/invoices/:id returns 404 for non-existent invoice', async () => {
      const res = await harness.request('GET', '/api/invoices/non_existent_id_999');
      assert.strictEqual(res.status, 404);
    });

    // ----------------------------------------------------
    // 5. PAYMENTS & RECONCILIATION CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 5. Payments & Settlement Endpoints ---');
    await test('POST /api/payments records partial payment and relieves AR', async () => {
      const res = await harness.recordPayment({
        customerId: 'cust_intra_27',
        amount: 50000.0,
        depositAccountId: 'acc_bank_1010',
        allocations: [{ invoiceId: intraInvoiceId, amount: 50000.0 }]
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.amount, 50000.0);
      const settled = res.body.settledInvoices[0];
      assert.strictEqual(settled.isFullyPaid, false);
      assert.strictEqual(settled.dueAmount, 68000.0);
      assert.strictEqual(settled.paidAmount, 50000.0);
    });

    await test('POST /api/payments records settlement of remaining due balance', async () => {
      const res = await harness.recordPayment({
        customerId: 'cust_intra_27',
        amount: 68000.0,
        depositAccountId: 'acc_cash_1000',
        allocations: [{ invoiceId: intraInvoiceId, amount: 68000.0 }]
      });

      assert.strictEqual(res.status, 201);
      const settled = res.body.settledInvoices[0];
      assert.strictEqual(settled.isFullyPaid, true);
      assert.strictEqual(settled.dueAmount, 0.0);
    });

    await test('POST /api/payments rejects overpayment allocation with 400 Bad Request', async () => {
      // Invoice is now fully paid (due = 0)
      const res = await harness.recordPayment({
        customerId: 'cust_intra_27',
        amount: 1000.0,
        depositAccountId: 'acc_bank_1010',
        allocations: [{ invoiceId: intraInvoiceId, amount: 1000.0 }]
      });
      assert.strictEqual(res.status, 400, 'Overpayment beyond invoice due amount must return 400');
    });

    await test('POST /api/payments rejects allocation sum mismatch with 400 Bad Request', async () => {
      const res = await harness.recordPayment({
        customerId: 'cust_intra_27',
        amount: 5000.0,
        allocations: [{ invoiceId: interInvoiceId, amount: 4000.0 }] // Mismatch: 5000 vs 4000
      });
      assert.strictEqual(res.status, 400, 'Allocation sum mismatch must return 400');
    });

    // ----------------------------------------------------
    // 6. INVOICE VOID & REVERSAL CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 6. Invoice Void & Reversal Endpoints ---');
    await test('POST /api/invoices/:id/void rejects voiding an invoice that has payments attached', async () => {
      // intraInvoiceId has payments attached
      const res = await harness.voidInvoice(intraInvoiceId, 'Void attempt on paid invoice');
      assert.strictEqual(res.status, 409, 'Must return 409 Conflict when attempting to void invoice with payments');
    });

    await test('POST /api/invoices/:id/void voids unpaid invoice with immutable contra-entries', async () => {
      const countLinesBefore = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;

      const res = await harness.voidInvoice(interInvoiceId, 'Customer cancellation test');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'VOIDED');
      assert.strictEqual(res.body.dueAmount, 0.0);
      assert.ok(res.body.reversalJournalEntryId);

      // Verify zero physical row deletions (append-only)
      const countLinesAfter = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;
      assert.ok(countLinesAfter > countLinesBefore, 'Reversal contra-entries must be appended to journal_lines');
    });

    await test('POST /api/invoices/:id/void rejects repeated void attempt with 400 Bad Request', async () => {
      const res = await harness.voidInvoice(interInvoiceId, 'Repeat void attempt');
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('already voided'));
    });

    // ----------------------------------------------------
    // 7. TRIAL BALANCE CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 7. Financial Reports: Trial Balance Contract ---');
    await test('GET /api/reports/trial-balance returns balanced report and account lines', async () => {
      const res = await harness.getTrialBalance();
      assert.strictEqual(res.status, 200);
      const tb = res.body;

      assert.strictEqual(tb.isBalanced, true, 'isBalanced must be true');
      assert.strictEqual(tb.difference, 0.0, 'difference must be 0.00');
      assert.strictEqual(tb.totalDebit, tb.totalCredit, 'Total Debit must equal Total Credit');
      assert.ok(Array.isArray(tb.accounts), 'accounts must be an array');
      assert.ok(tb.accounts.length > 0, 'accounts must have entries');

      const sampleAccount = tb.accounts[0];
      assert.ok(sampleAccount.accountId);
      assert.ok(sampleAccount.accountCode);
      assert.ok(sampleAccount.accountName);
      assert.ok(sampleAccount.type);
      assert.strictEqual(typeof sampleAccount.debit, 'number');
      assert.strictEqual(typeof sampleAccount.credit, 'number');
      assert.strictEqual(typeof sampleAccount.balance, 'number');
    });

    // ----------------------------------------------------
    // 8. TRANSACTIONS (AUDIT GL) CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 8. General Ledger Audit Transactions Contract ---');
    await test('GET /api/transactions returns immutable double-entry journal lines', async () => {
      const res = await harness.getTransactions();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.transactions));
      assert.ok(res.body.transactions.length > 0);

      const txn = res.body.transactions[0];
      assert.ok(txn.id);
      assert.ok(txn.entryNumber);
      assert.ok(txn.date);
      assert.ok(txn.accountCode);
      assert.ok(txn.accountName);
      assert.strictEqual(typeof txn.debit, 'number');
      assert.strictEqual(typeof txn.credit, 'number');
    });

    await test('GET /api/transactions filters by referenceId', async () => {
      const res = await harness.getTransactions({ referenceId: intraInvoiceId });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.transactions.length > 0);
      res.body.transactions.forEach((t: any) => {
        assert.strictEqual(t.referenceId, intraInvoiceId);
      });
    });

    // ----------------------------------------------------
    // 9. GSTR-1 STATUTORY TAX RETURN CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 9. GSTR-1 Statutory Return Contract ---');
    await test('GET /api/reports/gstr-1 returns Section 4A B2B and Section 12 HSN summary', async () => {
      const res = await harness.getGSTR1();
      assert.strictEqual(res.status, 200);
      const gstr = res.body;

      assert.ok(gstr.period);
      assert.ok(Array.isArray(gstr.b2bSummary), 'b2bSummary must be an array');
      assert.ok(Array.isArray(gstr.hsnSummary), 'hsnSummary must be an array');

      if (gstr.b2bSummary.length > 0) {
        const b2b = gstr.b2bSummary[0];
        assert.ok(b2b.customerName);
        assert.ok(b2b.invoiceNumber);
        assert.ok(b2b.placeOfSupply);
        assert.strictEqual(typeof b2b.taxableValue, 'number');
        assert.strictEqual(typeof b2b.rate, 'number');
        assert.strictEqual(typeof b2b.cgst, 'number');
        assert.strictEqual(typeof b2b.sgst, 'number');
        assert.strictEqual(typeof b2b.igst, 'number');
      }

      if (gstr.hsnSummary.length > 0) {
        const hsn = gstr.hsnSummary[0];
        assert.ok(hsn.hsnCode);
        assert.strictEqual(typeof hsn.totalQuantity, 'number');
        assert.strictEqual(typeof hsn.taxableValue, 'number');
      }
    });

    // ----------------------------------------------------
    // 10. IDEMPOTENCY-KEY HEADER PROTECTION CONTRACT
    // ----------------------------------------------------
    console.log('\n--- 10. Idempotency Guard Contract ---');
    await test('Idempotency-Key header returns cached response on duplicate retry', async () => {
      const idemKey = `idem_${Date.now()}_contract`;
      const invNum = `INV-IDEM-${Date.now().toString().slice(-4)}`;

      const resFirst = await harness.createInvoice({
        customerId: 'cust_intra_27',
        invoiceNumber: invNum,
        lines: [{ itemId: 'item_pc_8471', hsnCode: '8471', quantity: 1, unitPrice: 20000, taxRate: 18 }]
      }, { 'Idempotency-Key': idemKey });

      assert.strictEqual(resFirst.status, 201);

      // Duplicate request with identical Idempotency-Key
      const resSecond = await harness.createInvoice({
        customerId: 'cust_intra_27',
        invoiceNumber: invNum,
        lines: [{ itemId: 'item_pc_8471', hsnCode: '8471', quantity: 1, unitPrice: 20000, taxRate: 18 }]
      }, { 'Idempotency-Key': idemKey });

      assert.strictEqual(resSecond.status, 201);
      assert.strictEqual(resSecond.headers['x-cache-hit'], 'Idempotency-Guard');
      assert.strictEqual(resSecond.body.id, resFirst.body.id);
    });

  } finally {
    await harness.stop();
  }

  console.log('\n====================================================');
  console.log(`CONTRACT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    throw new Error(`${failed} API contract test(s) failed.`);
  }

  return { passed, failed };
}

if (require.main === module) {
  runApiContractTests().catch(err => {
    console.error('\n❌ API CONTRACT SUITE FAILED:', err.message);
    process.exit(1);
  });
}
