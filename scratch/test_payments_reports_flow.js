// Automated test for Payments, Trial Balance, Transactions, and GSTR-1 flows
const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('🚀 Running Payments, Trial Balance, Transactions, and GSTR-1 Verification...');
  const baseUrl = '127.0.0.1';
  const port = 3000;

  // 1. Get Accounts (find Bank 1010 and AR 1200)
  const accRes = await request({ hostname: baseUrl, port, path: '/api/accounts', method: 'GET' });
  const bankAcc = accRes.data.find(a => a.code === '1010');
  console.log(`✓ Found Bank Account: ${bankAcc.code} - ${bankAcc.name} (${bankAcc.id})`);

  // 2. Get Customers & Items
  const custRes = await request({ hostname: baseUrl, port, path: '/api/customers', method: 'GET' });
  const mhCust = custRes.data.find(c => (c.state_code || c.stateCode) === '27');
  const itemsRes = await request({ hostname: baseUrl, port, path: '/api/items', method: 'GET' });
  const item = itemsRes.data[0];

  // 3. Issue a fresh invoice for testing payment allocation
  console.log('\n--- 1. ISSUING TEST SALES INVOICE ---');
  const invNum = `INV-PAY-${Date.now().toString().slice(-6)}`;
  const invRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customerId: mhCust.id,
    invoiceNumber: invNum,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30*86400000).toISOString().split('T')[0],
    placeOfSupply: '27',
    lines: [
      {
        itemId: item.id,
        description: 'Testing Payment Allocation & AR Relief',
        hsnCode: item.hsn_code || item.hsnCode || '8471',
        quantity: 1,
        unitPrice: 50000,
        taxRate: 18
      }
    ],
    deliver: true
  });

  if (invRes.status !== 201) {
    throw new Error(`Failed to create test invoice: ${JSON.stringify(invRes.data)}`);
  }
  const invoice = invRes.data;
  console.log(`✓ Created test invoice ${invoice.invoiceNumber}. Total: ₹${invoice.totalAmount}, Due: ₹${invoice.dueAmount}`);

  // 4. Record Partial Payment (₹20,000 of ₹59,000)
  console.log('\n--- 2. RECORDING PARTIAL PAYMENT (₹20,000) ---');
  const partPayRes = await request({
    hostname: baseUrl, port, path: '/api/payments', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customerId: mhCust.id,
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 20000,
    depositAccountId: bankAcc.id,
    referenceNumber: 'NEFT-PART-10293',
    allocations: [
      { invoiceId: invoice.id, amount: 20000 }
    ]
  });

  if (partPayRes.status !== 201) {
    throw new Error(`Failed to record partial payment: ${JSON.stringify(partPayRes.data)}`);
  }
  console.log(`✓ Recorded partial payment ${partPayRes.data.paymentNumber}. GL Voucher: ${partPayRes.data.journalEntryId}`);
  const settled1 = partPayRes.data.settledInvoices[0];
  console.log(`  Updated invoice balance: Paid: ₹${settled1.paidAmount}, Remaining Due: ₹${settled1.dueAmount}`);
  if (settled1.paidAmount !== 20000 || settled1.dueAmount !== 39000 || settled1.isFullyPaid !== false) {
    throw new Error(`Partial payment balance mismatch! Expected Paid: 20000, Due: 39000. Got: ${JSON.stringify(settled1)}`);
  }

  // 5. Test Overpayment Rejection (Try allocating ₹40,000 when due is only ₹39,000)
  console.log('\n--- 3. TESTING OVERPAYMENT REJECTION GUARD ---');
  const overpayRes = await request({
    hostname: baseUrl, port, path: '/api/payments', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customerId: mhCust.id,
    amount: 40000,
    depositAccountId: bankAcc.id,
    referenceNumber: 'NEFT-OVER-FAIL',
    allocations: [
      { invoiceId: invoice.id, amount: 40000 }
    ]
  });

  console.log(`✓ Overpayment rejected with HTTP ${overpayRes.status}: "${overpayRes.data.message || overpayRes.data.error}"`);
  if (overpayRes.status !== 400) {
    throw new Error(`Expected HTTP 400 Bad Request on overpayment, got ${overpayRes.status}`);
  }

  // 6. Test Sum Mismatch Rejection (Total ₹39,000 but allocations sum to ₹30,000)
  console.log('\n--- 4. TESTING ALLOCATION MISMATCH REJECTION GUARD ---');
  const mismatchRes = await request({
    hostname: baseUrl, port, path: '/api/payments', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customerId: mhCust.id,
    amount: 39000,
    depositAccountId: bankAcc.id,
    referenceNumber: 'NEFT-MISMATCH-FAIL',
    allocations: [
      { invoiceId: invoice.id, amount: 30000 }
    ]
  });
  console.log(`✓ Allocation sum mismatch rejected with HTTP ${mismatchRes.status}: "${mismatchRes.data.message || mismatchRes.data.error}"`);
  if (mismatchRes.status !== 400) {
    throw new Error(`Expected HTTP 400 Bad Request on sum mismatch, got ${mismatchRes.status}`);
  }

  // 7. Full Settlement Payment (remaining ₹39,000)
  console.log('\n--- 5. RECORDING FINAL SETTLEMENT PAYMENT (₹39,000) ---');
  const fullPayRes = await request({
    hostname: baseUrl, port, path: '/api/payments', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customerId: mhCust.id,
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 39000,
    depositAccountId: bankAcc.id,
    referenceNumber: 'NEFT-FINAL-99481',
    allocations: [
      { invoiceId: invoice.id, amount: 39000 }
    ]
  });

  if (fullPayRes.status !== 201) {
    throw new Error(`Failed to record full settlement: ${JSON.stringify(fullPayRes.data)}`);
  }
  const settled2 = fullPayRes.data.settledInvoices[0];
  console.log(`✓ Full settlement recorded! Paid: ₹${settled2.paidAmount}, Due: ₹${settled2.dueAmount}, Fully Settled: ${settled2.isFullyPaid}`);
  if (settled2.paidAmount !== 59000 || settled2.dueAmount !== 0 || settled2.isFullyPaid !== true) {
    throw new Error(`Full payment balance mismatch! Expected Paid: 59000, Due: 0. Got: ${JSON.stringify(settled2)}`);
  }

  // 8. Verify Trial Balance Equilibrium
  console.log('\n--- 6. VERIFYING AUTHORITATIVE TRIAL BALANCE REPORT ---');
  const tbRes = await request({ hostname: baseUrl, port, path: '/api/reports/trial-balance', method: 'GET' });
  const tb = tbRes.data;
  console.log(`✓ Trial Balance fetched: Total Debit: ₹${tb.totalDebit}, Total Credit: ₹${tb.totalCredit}`);
  console.log(`  Difference: ${tb.difference}, Balanced Status: ${tb.isBalanced}`);
  if (!tb.isBalanced || Number(tb.difference) !== 0) {
    throw new Error(`Trial balance out of equilibrium! Diff: ${tb.difference}`);
  }
  console.log(`  Number of active accounts in Trial Balance: ${tb.accounts.length}`);

  // 9. Verify Transactions / Journal Explorer
  console.log('\n--- 7. VERIFYING AUDIT JOURNAL VOUCHERS ---');
  const txRes = await request({ hostname: baseUrl, port, path: '/api/transactions', method: 'GET' });
  const txs = txRes.data.transactions;
  console.log(`✓ Total journal line postings fetched: ${txs.length}`);
  
  // Group by entryNumber and verify every single voucher is balanced
  const voucherMap = new Map();
  txs.forEach(t => {
    if (!voucherMap.has(t.entryNumber)) voucherMap.set(t.entryNumber, { debit: 0, credit: 0 });
    const v = voucherMap.get(t.entryNumber);
    v.debit += (t.debit || 0);
    v.credit += (t.credit || 0);
  });
  console.log(`✓ Total distinct journal vouchers: ${voucherMap.size}`);
  voucherMap.forEach((v, num) => {
    const diff = Math.abs(v.debit - v.credit);
    if (diff > 0.0001) {
      throw new Error(`Journal voucher ${num} is UNBALANCED! Debit: ${v.debit}, Credit: ${v.credit}`);
    }
  });
  console.log(`✓ 100% of journal vouchers in the ledger are mathematically balanced (Dr == Cr).`);

  // 10. Verify GSTR-1 Statutory Return
  console.log('\n--- 8. VERIFYING GSTR-1 STATUTORY REPORT ---');
  const gstrRes = await request({ hostname: baseUrl, port, path: '/api/reports/gstr-1', method: 'GET' });
  const gstr = gstrRes.data;
  console.log(`✓ GSTR-1 fetched. Period: ${JSON.stringify(gstr.period)}`);
  console.log(`  B2B Invoices Count: ${gstr.b2bSummary.length}`);
  console.log(`  HSN Summary Records: ${gstr.hsnSummary.length}`);
  if (gstr.b2bSummary.length === 0 || gstr.hsnSummary.length === 0) {
    throw new Error('Expected non-empty B2B and HSN summaries in GSTR-1!');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL PAYMENTS, TRIAL BALANCE, JOURNAL & GSTR-1 TESTS PASSED!');
  console.log('================================================================');
}

run().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
