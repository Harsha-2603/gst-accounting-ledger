/**
 * Full End-to-End QA Execution Script
 * Executes all Scenarios A through G, Error/Edge Tests, and Validations.
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const qaResults = {
  passed: [],
  failed: [],
  fixedIssues: [],
  knownLimitations: []
};

async function runQA() {
  console.log('====================================================');
  console.log('🧪 EXECUTING FULL QA TEST SCENARIOS (A THROUGH G)');
  console.log('====================================================\n');

  // ==================================================
  // SCENARIO A — INTRA-STATE GST INVOICE
  // ==================================================
  console.log('▶ SCENARIO A: Intra-State GST Invoice Flow');
  try {
    // 1. Get or create customer in State 27 (Maharashtra)
    const custRes = await request('GET', '/api/customers');
    assert.strictEqual(custRes.status, 200);
    let intraCust = custRes.body.find(c => c.stateCode === '27' || c.state_code === '27');
    if (!intraCust) {
      const newCust = await request('POST', '/api/customers', {
        name: 'Mumbai Retail Traders Pvt Ltd',
        stateCode: '27',
        gstin: '27AABCM9999F1Z1',
        email: 'billing@mumbaitraders.in'
      });
      intraCust = newCust.body;
    }
    console.log(`  [A.1] Selected Intra-State Customer: ${intraCust.name} (State: 27)`);

    // 2. Get or create catalog item with HSN
    const itemRes = await request('GET', '/api/items');
    assert.strictEqual(itemRes.status, 200);
    let item = itemRes.body[0];
    if (!item) {
      const newItem = await request('POST', '/api/items', {
        name: 'Standard Hardware Unit',
        hsnCode: '8471',
        defaultTaxRate: 18,
        unitPrice: 10000
      });
      item = newItem.body;
    }
    console.log(`  [A.2] Selected Item: ${item.name} (HSN: ${item.hsnCode || item.hsn_code})`);

    // 3. Create Intra-State Invoice: Taxable = ₹10,000, GST = 18%
    const invNumA = `INV-QA-INTRA-${Date.now().toString().slice(-4)}`;
    const createA = await request('POST', '/api/invoices', {
      customerId: intraCust.id,
      invoiceNumber: invNumA,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30*86400000).toISOString().split('T')[0],
      deliver: true, // Delivers invoice and posts GL entries
      lines: [
        {
          itemId: item.id,
          description: 'High Performance Router',
          hsnCode: '8471',
          quantity: 1,
          unitPrice: 10000,
          taxRate: 18
        }
      ]
    });

    assert.strictEqual(createA.status, 201, 'Invoice creation must return 201 Created');
    const invA = createA.body;

    // 4. Verify Dual Split
    assert.strictEqual(invA.subtotal, 10000, 'Subtotal must be ₹10,000');
    assert.strictEqual(invA.cgstAmount, 900, 'CGST must be exactly ₹900 (9%)');
    assert.strictEqual(invA.sgstAmount, 900, 'SGST must be exactly ₹900 (9%)');
    assert.strictEqual(invA.igstAmount, 0, 'IGST must be exactly ₹0');
    assert.strictEqual(invA.totalAmount, 11800, 'Total must be exactly ₹11,800');
    assert.strictEqual(invA.status, 'DELIVERED', 'Status must be DELIVERED');
    assert.ok(invA.journalEntryId, 'Must have linked Journal Entry');
    console.log(`  [A.3] Verified Dual Split: Subtotal ₹${invA.subtotal} + CGST ₹${invA.cgstAmount} + SGST ₹${invA.sgstAmount} = Total ₹${invA.totalAmount}`);

    // 5. Open invoice details via GET /api/invoices/:id
    const detA = await request('GET', `/api/invoices/${invA.id}`);
    assert.strictEqual(detA.status, 200);
    assert.strictEqual(detA.body.dueAmount, 11800, 'Due amount must initially equal total');
    console.log(`  [A.4] Invoice Details fetched successfully (Due: ₹${detA.body.dueAmount})`);

    qaResults.passed.push('SCENARIO A — Intra-State GST Invoice Creation & 50/50 Dual-Split');
  } catch (err) {
    console.error('  ❌ SCENARIO A FAILED:', err.message);
    qaResults.failed.push(`SCENARIO A: ${err.message}`);
  }

  // ==================================================
  // SCENARIO B — PAYMENT (PARTIAL & FULL SETTLEMENT)
  // ==================================================
  console.log('\n▶ SCENARIO B: Payment & AR Settlement Flow');
  try {
    // We use invoice A from above
    const invoices = await request('GET', '/api/invoices?status=DELIVERED');
    const targetInv = invoices.body.find(i => i.dueAmount === 11800) || invoices.body[0];
    assert.ok(targetInv, 'Delivered invoice must exist for payment');

    // Deposit Account (Cash on Hand 1000 or Bank 1010)
    const accs = await request('GET', '/api/accounts');
    const bankAcc = accs.body.find(a => a.code === '1010' || a.code === '1000');
    assert.ok(bankAcc, 'Bank or Cash account must exist');

    // 1. Partial Payment of ₹5,000
    const partialPay = await request('POST', '/api/payments', {
      customerId: targetInv.customerId || targetInv.customer_id,
      depositAccountId: bankAcc.id,
      amount: 5000,
      paymentDate: new Date().toISOString().split('T')[0],
      referenceNumber: `UTR-PARTIAL-${Date.now()}`,
      allocations: [
        { invoiceId: targetInv.id, amount: 5000 }
      ]
    });
    assert.strictEqual(partialPay.status, 201, 'Partial payment must return 201');

    // Verify invoice state after partial payment
    const invAfterPartial = await request('GET', `/api/invoices/${targetInv.id}`);
    assert.strictEqual(invAfterPartial.body.paidAmount, 5000, 'Paid amount must increase to ₹5,000');
    assert.strictEqual(invAfterPartial.body.dueAmount, 6800, 'Due amount must decrease to ₹6,800');
    console.log(`  [B.1] Partial Payment: Paid = ₹${invAfterPartial.body.paidAmount}, Due = ₹${invAfterPartial.body.dueAmount}`);

    // 2. Remaining Payment of ₹6,800 (Full Settlement)
    const finalPay = await request('POST', '/api/payments', {
      customerId: targetInv.customerId || targetInv.customer_id,
      depositAccountId: bankAcc.id,
      amount: 6800,
      paymentDate: new Date().toISOString().split('T')[0],
      referenceNumber: `UTR-FINAL-${Date.now()}`,
      allocations: [
        { invoiceId: targetInv.id, amount: 6800 }
      ]
    });
    assert.strictEqual(finalPay.status, 201, 'Final payment must return 201');

    // Verify invoice state after final settlement
    const invAfterFinal = await request('GET', `/api/invoices/${targetInv.id}`);
    assert.strictEqual(invAfterFinal.body.paidAmount, 11800, 'Paid amount must equal total');
    assert.strictEqual(invAfterFinal.body.dueAmount, 0, 'Due amount must be ₹0');
    console.log(`  [B.2] Full Settlement: Paid = ₹${invAfterFinal.body.paidAmount}, Due = ₹${invAfterFinal.body.dueAmount}`);

    // 3. Verify Journal View (GET /api/transactions)
    const txRes = await request('GET', `/api/transactions?referenceId=${finalPay.body.id}`);
    assert.strictEqual(txRes.status, 200);
    const txLines = txRes.body.transactions;
    const totalDr = txLines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCr = txLines.reduce((s, l) => s + (l.credit || 0), 0);
    assert.strictEqual(totalDr, 6800, 'Payment debit to Cash/Bank must be ₹6,800');
    assert.strictEqual(totalCr, 6800, 'Payment credit to AR must be ₹6,800');
    console.log(`  [B.3] Double-entry payment voucher verified: Dr ₹${totalDr} == Cr ₹${totalCr}`);

    qaResults.passed.push('SCENARIO B — Partial & Full Payment Settlement and AR Relief');
  } catch (err) {
    console.error('  ❌ SCENARIO B FAILED:', err.message);
    qaResults.failed.push(`SCENARIO B: ${err.message}`);
  }

  // ==================================================
  // SCENARIO C — TRIAL BALANCE
  // ==================================================
  console.log('\n▶ SCENARIO C: Trial Balance Equilibrium Verification');
  try {
    const tbRes = await request('GET', '/api/reports/trial-balance');
    assert.strictEqual(tbRes.status, 200);
    const tb = tbRes.body;

    assert.ok(typeof tb.totalDebit === 'number');
    assert.ok(typeof tb.totalCredit === 'number');
    assert.strictEqual(tb.difference, 0, 'Mathematical difference must be 0');
    assert.strictEqual(tb.isBalanced, true, 'isBalanced must be true');
    console.log(`  [C.1] Total Debit: ₹${tb.totalDebit} | Total Credit: ₹${tb.totalCredit} | Difference: ₹${tb.difference}`);
    console.log(`  [C.2] Authoritative Equilibrium Status: ${tb.isBalanced ? '✓ BALANCED' : 'UNBALANCED'}`);

    qaResults.passed.push('SCENARIO C — Live Trial Balance Mathematical Equilibrium');
  } catch (err) {
    console.error('  ❌ SCENARIO C FAILED:', err.message);
    qaResults.failed.push(`SCENARIO C: ${err.message}`);
  }

  // ==================================================
  // SCENARIO D — VOID / IMMUTABLE REVERSAL
  // ==================================================
  console.log('\n▶ SCENARIO D: Immutable Invoice Void / Reversal Protocol');
  try {
    // 1. Create a fresh invoice to void
    const custRes = await request('GET', '/api/customers');
    const cust = custRes.body[0];
    const itemRes = await request('GET', '/api/items');
    const item = itemRes.body[0];

    const invNumD = `INV-QA-VOID-${Date.now().toString().slice(-4)}`;
    const createD = await request('POST', '/api/invoices', {
      customerId: cust.id,
      invoiceNumber: invNumD,
      deliver: true,
      lines: [
        {
          itemId: item.id,
          hsnCode: '8471',
          quantity: 2,
          unitPrice: 5000,
          taxRate: 18
        }
      ]
    });
    const invD = createD.body;
    console.log(`  [D.1] Created eligible invoice ${invD.invoiceNumber} (Total: ₹${invD.totalAmount})`);

    // 2. Count journal lines before voiding
    const txBefore = await request('GET', `/api/transactions?referenceId=${invD.id}`);
    const originalTxLinesCount = txBefore.body.transactions.length;
    assert.ok(originalTxLinesCount > 0, 'Original journal lines must exist');

    // 3. Void the invoice
    const voidRes = await request('POST', `/api/invoices/${invD.id}/void`, {
      reason: 'Customer cancelled order before dispatch'
    });
    assert.strictEqual(voidRes.status, 200);
    assert.strictEqual(voidRes.body.status, 'VOIDED', 'Status must transition to VOIDED');
    assert.ok(voidRes.body.reversalJournalEntryId, 'Reversal voucher must be created');
    console.log(`  [D.2] Invoice voided. Reversal Voucher: ${voidRes.body.reversalJournalEntryId}`);

    // 4. Verify ZERO SQL DELETE (original lines preserved + reversal lines added)
    const txAfter = await request('GET', '/api/transactions');
    const origLinesPreserved = txAfter.body.transactions.filter(t => t.referenceId === invD.id && t.entryType === 'INVOICE');
    assert.strictEqual(origLinesPreserved.length, originalTxLinesCount, 'Original lines must NEVER be deleted');
    const reversalLines = txAfter.body.transactions.filter(t => t.entryType === 'REVERSAL');
    assert.ok(reversalLines.length > 0, 'Reversal contra-entries must be present');
    console.log(`  [D.3] Verified Audit Trail: ${origLinesPreserved.length} original lines preserved, ${reversalLines.length} reversal lines recorded.`);

    // 5. Verify Trial Balance remains in equilibrium
    const tbAfterVoid = await request('GET', '/api/reports/trial-balance');
    assert.strictEqual(tbAfterVoid.body.isBalanced, true, 'Trial Balance must remain balanced after reversal');
    console.log(`  [D.4] Trial Balance remains balanced: Diff = ₹${tbAfterVoid.body.difference}`);

    qaResults.passed.push('SCENARIO D — Immutable Invoice Reversal & Zero Audit Trail Deletion');
  } catch (err) {
    console.error('  ❌ SCENARIO D FAILED:', err.message);
    qaResults.failed.push(`SCENARIO D: ${err.message}`);
  }

  // ==================================================
  // SCENARIO E — INTER-STATE GST (IGST)
  // ==================================================
  console.log('\n▶ SCENARIO E: Inter-State GST (100% IGST) Flow');
  try {
    // 1. Get or create customer in State 24 (Gujarat)
    const custRes = await request('GET', '/api/customers');
    let interCust = custRes.body.find(c => c.stateCode === '24' || c.state_code === '24');
    if (!interCust) {
      const newInter = await request('POST', '/api/customers', {
        name: 'Ahmedabad Industrial Supplies',
        stateCode: '24',
        gstin: '24AABCA1234F1Z9'
      });
      interCust = newInter.body;
    }

    const itemRes = await request('GET', '/api/items');
    const item = itemRes.body[0];

    // 2. Create Inter-State invoice: ₹10,000 @ 18% GST
    const invNumE = `INV-QA-INTER-${Date.now().toString().slice(-4)}`;
    const createE = await request('POST', '/api/invoices', {
      customerId: interCust.id,
      invoiceNumber: invNumE,
      deliver: true,
      lines: [
        {
          itemId: item.id,
          hsnCode: '8471',
          quantity: 1,
          unitPrice: 10000,
          taxRate: 18
        }
      ]
    });
    assert.strictEqual(createE.status, 201);
    const invE = createE.body;

    // 3. Verify IGST bifurcation
    assert.strictEqual(invE.cgstAmount, 0, 'CGST must be ₹0 for inter-state supply');
    assert.strictEqual(invE.sgstAmount, 0, 'SGST must be ₹0 for inter-state supply');
    assert.strictEqual(invE.igstAmount, 1800, 'IGST must be exactly ₹1,800 (100% of 18%)');
    assert.strictEqual(invE.totalAmount, 11800, 'Total must be ₹11,800');
    console.log(`  [E.1] Verified IGST: CGST ₹${invE.cgstAmount}, SGST ₹${invE.sgstAmount}, IGST ₹${invE.igstAmount}, Total ₹${invE.totalAmount}`);

    // 4. Verify GL postings for IGST
    const txE = await request('GET', `/api/transactions?referenceId=${invE.id}`);
    const igstLine = txE.body.transactions.find(l => l.accountCode === '2130'); // Output IGST Payable
    assert.ok(igstLine, 'Must post to Output IGST Payable (2130)');
    assert.strictEqual(igstLine.credit, 1800, 'Output IGST must have credit of ₹1,800');
    console.log(`  [E.2] Verified General Ledger posting to Account 2130 (Output IGST Payable) for ₹1,800.`);

    qaResults.passed.push('SCENARIO E — Inter-State GST (100% IGST Allocation)');
  } catch (err) {
    console.error('  ❌ SCENARIO E FAILED:', err.message);
    qaResults.failed.push(`SCENARIO E: ${err.message}`);
  }

  // ==================================================
  // SCENARIO F — GSTR-1 STATUTORY TAX RETURN
  // ==================================================
  console.log('\n▶ SCENARIO F: GSTR-1 Statutory Return Verification');
  try {
    const gstr1Res = await request('GET', '/api/reports/gstr-1');
    assert.strictEqual(gstr1Res.status, 200);
    const gstr1 = gstr1Res.body;

    assert.ok(gstr1.b2bInvoices && Array.isArray(gstr1.b2bInvoices), 'b2bInvoices must be array');
    assert.ok(gstr1.hsnSummary && Array.isArray(gstr1.hsnSummary), 'hsnSummary must be array');
    assert.ok(gstr1.summary, 'Summary object must be present');

    console.log(`  [F.1] Section 4A (B2B Invoices): ${gstr1.b2bInvoices.length} invoices returned.`);
    console.log(`  [F.2] Section 12 (HSN Summary): ${gstr1.hsnSummary.length} HSN code classifications.`);
    console.log(`  [F.3] Summary Totals: Taxable ₹${gstr1.summary.totalTaxable} | CGST ₹${gstr1.summary.totalCgst} | SGST ₹${gstr1.summary.totalSgst} | IGST ₹${gstr1.summary.totalIgst}`);

    assert.ok(gstr1.summary.totalTaxable >= 10000, 'Taxable value must reflect delivered invoices');
    assert.ok(gstr1.summary.totalCgst >= 900, 'CGST must reflect intra-state invoices');
    assert.ok(gstr1.summary.totalIgst >= 1800, 'IGST must reflect inter-state invoices');

    qaResults.passed.push('SCENARIO F — GSTR-1 Section 4A B2B & Section 12 HSN Summary Return');
  } catch (err) {
    console.error('  ❌ SCENARIO F FAILED:', err.message);
    qaResults.failed.push(`SCENARIO F: ${err.message}`);
  }

  // ==================================================
  // SCENARIO G — AI COPILOT
  // ==================================================
  console.log('\n▶ SCENARIO G: AI Accounting Copilot Flow');
  try {
    // 1. Grounded Question: "Why is this invoice ₹11,800?"
    const aiInv = await request('POST', '/api/ai/copilot', { message: 'Why is invoice INV-0001 ₹11,800?' });
    assert.strictEqual(aiInv.status, 200);
    assert.ok(aiInv.body.sources.length > 0, 'Sources must be returned');
    console.log(`  [G.1] Answer: "${aiInv.body.answer.slice(0, 90)}..." (Sources: [${aiInv.body.sources.join(', ')}])`);

    // 2. Grounded Question: "Does my Trial Balance balance?"
    const aiTb = await request('POST', '/api/ai/copilot', { message: 'Does my Trial Balance balance?' });
    assert.strictEqual(aiTb.status, 200);
    assert.ok(aiTb.body.sources.includes('report:trial-balance'));
    console.log(`  [G.2] Answer: "${aiTb.body.answer.slice(0, 90)}..."`);

    // 3. Mutation Protection: "Record a ₹5,000 payment."
    const countPaymentsBefore = (await request('GET', '/api/payments')).body.length;
    const aiMut = await request('POST', '/api/ai/copilot', { message: 'Record a ₹5,000 payment.' });
    assert.strictEqual(aiMut.status, 200);
    assert.ok(aiMut.body.sources.includes('security:read_only_invariant'));
    assert.ok(aiMut.body.answer.toLowerCase().includes('read-only'));

    // Assert 0 mutations in DB
    const countPaymentsAfter = (await request('GET', '/api/payments')).body.length;
    assert.strictEqual(countPaymentsBefore, countPaymentsAfter, 'ZERO payment mutations must occur');
    console.log(`  [G.3] Mutation intercepted and rejected! 0 payments created in database.`);

    // 4. Disabled Mode
    const aiDis = await request('POST', '/api/ai/copilot', { message: 'simulate_disabled mode check' });
    assert.strictEqual(aiDis.status, 200);
    assert.strictEqual(aiDis.body.aiEnabled, false);
    console.log(`  [G.4] Disabled mode returns clear notice: "${aiDis.body.answer}"`);

    // 5. Provider Failure Simulation
    const aiFail = await request('POST', '/api/ai/copilot', { message: 'force_provider_error check' });
    assert.strictEqual(aiFail.status, 503);
    assert.strictEqual(aiFail.body.error, 'AI_PROVIDER_UNAVAILABLE');
    // Ensure core accounting is untouched
    const healthCheck = await request('GET', '/health');
    assert.strictEqual(healthCheck.status, 200);
    console.log(`  [G.5] Provider failure returns HTTP 503 fallback; core accounting remains 100% operational.`);

    qaResults.passed.push('SCENARIO G — AI Copilot Grounded Inquiries, Mutation Shield, and Fallbacks');
  } catch (err) {
    console.error('  ❌ SCENARIO G FAILED:', err.message);
    qaResults.failed.push(`SCENARIO G: ${err.message}`);
  }

  // ==================================================
  // ERROR & EDGE CASES
  // ==================================================
  console.log('\n▶ ERROR / EDGE CASES VALIDATION');
  try {
    const custRes = await request('GET', '/api/customers');
    const cust = custRes.body[0];
    const itemRes = await request('GET', '/api/items');
    const item = itemRes.body[0];

    // 1. Duplicate Invoice Number
    const dupNum = `INV-DUP-${Date.now()}`;
    await request('POST', '/api/invoices', {
      customerId: cust.id,
      invoiceNumber: dupNum,
      lines: [{ itemId: item.id, hsnCode: '8471', quantity: 1, unitPrice: 1000, taxRate: 18 }]
    });
    const dupRes = await request('POST', '/api/invoices', {
      customerId: cust.id,
      invoiceNumber: dupNum,
      lines: [{ itemId: item.id, hsnCode: '8471', quantity: 1, unitPrice: 1000, taxRate: 18 }]
    });
    assert.strictEqual(dupRes.status, 409, 'Duplicate invoice number must return 409 Conflict');
    console.log('  [Edge 1] Duplicate invoice number rejected with HTTP 409 Conflict.');

    // 2. Missing HSN Code
    const noHsnRes = await request('POST', '/api/invoices', {
      customerId: cust.id,
      lines: [{ itemId: item.id, quantity: 1, unitPrice: 1000, taxRate: 18 }] // missing hsnCode
    });
    assert.strictEqual(noHsnRes.status, 400, 'Missing HSN code must return 400 Bad Request');
    console.log('  [Edge 2] Missing HSN code rejected with HTTP 400 Bad Request.');

    // 3. Invalid GST Rate Slab
    const badGstRes = await request('POST', '/api/invoices', {
      customerId: cust.id,
      lines: [{ itemId: item.id, hsnCode: '8471', quantity: 1, unitPrice: 1000, taxRate: 23 }] // 23% is invalid slab
    });
    assert.strictEqual(badGstRes.status, 400, 'Invalid GST rate must return 400 Bad Request');
    console.log('  [Edge 3] Invalid GST rate (23%) rejected with HTTP 400 Bad Request.');

    // 4. Overpayment Rejection
    const invRes = await request('GET', '/api/invoices?status=DELIVERED');
    const openInv = invRes.body.find(i => i.dueAmount > 0);
    if (openInv) {
      const overpayRes = await request('POST', '/api/payments', {
        customerId: openInv.customerId || openInv.customer_id,
        depositAccountId: (await request('GET', '/api/accounts')).body[0].id,
        amount: openInv.dueAmount + 50000,
        allocations: [{ invoiceId: openInv.id, amount: openInv.dueAmount + 50000 }]
      });
      assert.strictEqual(overpayRes.status, 400, 'Overpayment exceeding due balance must return 400');
      console.log('  [Edge 4] Overpayment allocation rejected with HTTP 400 Bad Request.');
    }

    // 5. Void Already-Voided Invoice
    const voidedInv = (await request('GET', '/api/invoices?status=VOIDED')).body[0];
    if (voidedInv) {
      const reVoidRes = await request('POST', `/api/invoices/${voidedInv.id}/void`, { reason: 'repeat' });
      assert.strictEqual(reVoidRes.status, 400, 'Voiding an already-voided invoice must return 400');
      console.log('  [Edge 5] Second void attempt rejected safely with HTTP 400 Bad Request.');
    }

    // 6. Empty Request Body
    const emptyRes = await request('POST', '/api/invoices', {});
    assert.strictEqual(emptyRes.status, 400, 'Empty invoice body must return 400');
    console.log('  [Edge 6] Empty request payload rejected safely with HTTP 400 Bad Request.');

    qaResults.passed.push('ERROR / EDGE TESTS — Handled cleanly with zero crashes');
  } catch (err) {
    console.error('  ❌ ERROR/EDGE TEST FAILED:', err.message);
    qaResults.failed.push(`ERROR/EDGE: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log(`QA SUMMARY: ${qaResults.passed.length} PASSED, ${qaResults.failed.length} FAILED`);
  console.log('====================================================');

  if (qaResults.failed.length > 0) {
    process.exit(1);
  }
}

runQA().catch(err => {
  console.error('FATAL QA RUNNER ERROR:', err);
  process.exit(1);
});
