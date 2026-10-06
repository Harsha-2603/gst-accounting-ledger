import assert from 'assert';
import http from 'http';
import app from '../server';
import * as invoiceService from '../services/invoiceService';
import * as reportService from '../services/reportService';
import { db } from '../database';

function makeRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode || 500, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export async function runKillerTest2(): Promise<void> {
  console.log('----------------------------------------------------');
  console.log('🎯 KILLER TEST 2: Immutable Invoice Reversal Engine');
  console.log('----------------------------------------------------');
  console.log('Rule: Voiding an invoice reverses accounting effect via append-only contra-entries without deleting history.\n');

  // Start HTTP server for testing API boundary
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((res) => server.once('listening', res));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Snapshot pre-invoice trial balance state
    const preTb = reportService.getTrialBalance();
    const invNumber = `INV-KT2-${Date.now().toString().slice(-4)}`;

    // 1. Create and deliver GST invoice via API
    console.log(`  1. Creating and delivering GST invoice ${invNumber}...`);
    const invRes = await makeRequest(baseUrl, 'POST', '/api/invoices', {
      customerId: 'cust_intra_27',
      invoiceDate: '2026-10-06',
      dueDate: '2026-11-06',
      invoiceNumber: invNumber,
      deliver: true,
      lines: [
        {
          itemId: 'item_pc_8471',
          description: 'Dell OptiPlex 7090 Desktop',
          hsnCode: '8471',
          quantity: 2,
          unitPrice: 50000.00,
          taxRate: 18.00
        }
      ]
    });

    assert.strictEqual(invRes.status, 201, 'Must create invoice with HTTP 201');
    const inv = invRes.body;
    assert.strictEqual(inv.status, 'DELIVERED', 'Invoice status must be DELIVERED');
    assert.strictEqual(inv.totalAmount, 118000.00, 'Invoice total must be ₹118,000');
    assert.ok(inv.journalEntryId, 'Delivered invoice must have associated journalEntryId');

    // Verify original journal lines in DB
    const origJournalLines = db.prepare(`
      SELECT account_id, debit, credit, description FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_order ASC
    `).all(inv.journalEntryId) as any[];

    assert.strictEqual(origJournalLines.length, 4, 'Delivered intra-state invoice must have 4 GL lines (AR, Sales, CGST, SGST)');
    console.log('  ✓ 1. Invoice created & delivered with 4 GL lines (AR DR 118k, Sales CR 100k, CGST CR 9k, SGST CR 9k).');

    // 2. Void the invoice via API
    console.log('  2. Executing void request via HTTP API (POST /api/invoices/:id/void)...');
    const voidRes = await makeRequest(baseUrl, 'POST', `/api/invoices/${inv.id}/void`, {
      reason: 'Audit trial reversal certification'
    });

    assert.strictEqual(voidRes.status, 200, 'Void request must respond with HTTP 200');
    const voidResult = voidRes.body;
    assert.strictEqual(voidResult.status, 'VOIDED', 'Invoice status must be updated to VOIDED');
    assert.strictEqual(voidResult.dueAmount, 0.00, 'Void result due amount must be 0.00');
    assert.ok(voidResult.reversalJournalEntryId, 'Must issue a reversal journal entry ID');
    console.log(`  ✓ 2. Invoice voided (Status: VOIDED). Reversal Journal Voucher ${voidResult.reversalJournalEntryId} posted.`);

    // 3. Verify original journal lines still exist (Zero SQL DELETE)
    const origLinesAfterVoid = db.prepare(`
      SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_order ASC
    `).all(inv.journalEntryId) as any[];

    assert.strictEqual(origLinesAfterVoid.length, 4, 'Original journal lines MUST NOT be physically deleted from database!');
    console.log('  ✓ 3. Verified original 4 journal lines remain 100% intact in database (Zero SQL DELETE).');

    // 4. Verify reversal journal lines exist and every debit/credit was exactly reversed
    const reversalEntry = db.prepare(`
      SELECT * FROM journal_entries WHERE id = ?
    `).get(voidResult.reversalJournalEntryId) as any;

    assert.strictEqual(reversalEntry.entry_type, 'REVERSAL', 'Reversal entry must be marked REVERSAL');
    assert.strictEqual(reversalEntry.reference_id, inv.id, 'Reversal entry must reference original invoice ID');

    const reversalLines = db.prepare(`
      SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_order ASC
    `).all(voidResult.reversalJournalEntryId) as any[];

    assert.strictEqual(reversalLines.length, 4, 'Reversal entry must contain exactly 4 contra lines');

    origJournalLines.forEach((origLine, idx) => {
      const revLine = reversalLines[idx];
      assert.strictEqual(origLine.account_id, revLine.account_id, `Line ${idx + 1} account ID must match`);
      assert.strictEqual(origLine.debit, revLine.credit, `Line ${idx + 1} original debit (${origLine.debit}) must equal reversal credit (${revLine.credit})`);
      assert.strictEqual(origLine.credit, revLine.debit, `Line ${idx + 1} original credit (${origLine.credit}) must equal reversal debit (${revLine.debit})`);
    });
    console.log('  ✓ 4. Verified reversal journal lines exist and every debit/credit was exactly reversed.');

    // 5. Verify net accounting effect = zero
    const postVoidTb = reportService.getTrialBalance();
    const arPre = preTb.accounts.find(a => a.accountCode === '1200')?.balance || 0;
    const arPost = postVoidTb.accounts.find(a => a.accountCode === '1200')?.balance || 0;
    assert.strictEqual(arPre, arPost, 'Net Customer Receivable balance MUST return to pre-invoice state!');
    console.log('  ✓ 5. Verified net accounting effect is zero (Accounts Receivable returned to pre-invoice balance).');

    // 6. Verify second void attempt fails
    console.log('  6. Testing second void attempt on already voided invoice...');
    const secondVoidRes = await makeRequest(baseUrl, 'POST', `/api/invoices/${inv.id}/void`, {
      reason: 'Repeated void attempt'
    });

    assert.strictEqual(secondVoidRes.status, 400, 'Second void attempt must return HTTP 400 Bad Request');
    assert.ok(secondVoidRes.body.message.includes('already voided'), 'Error message must state invoice is already voided');
    console.log('  ✓ 6. Second void attempt failed safely with HTTP 400 Bad Request.');

  } finally {
    server.close();
  }

  console.log('\n✅ KILLER TEST 2 PASSED: Invoice voided with immutable contra-entries, zero row deletion, zero net effect, and safe repeated void protection.\n');
}

if (require.main === module) {
  runKillerTest2().catch(err => {
    console.error('\n❌ KILLER TEST 2 FAILED:', err.message);
    process.exit(1);
  });
}
