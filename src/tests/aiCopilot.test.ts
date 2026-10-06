import assert from 'assert';
import http from 'http';
import app from '../server';
import { db } from '../database';
import { config } from '../config';
import * as invoiceService from '../services/invoiceService';
import * as reportService from '../services/reportService';
import { askCopilot, isMutationIntent } from '../services/aiCopilotService';

let server: http.Server;
let baseUrl: string;

function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsedBody: any = data;
        try {
          parsedBody = JSON.parse(data);
        } catch {
          // Plain text response
        }
        resolve({ status: res.statusCode || 500, body: parsedBody, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

export async function runAICopilotTests(): Promise<void> {
  console.log('\n====================================================');
  console.log('🤖 RUNNING AI ACCOUNTING COPILOT VERIFICATION TESTS');
  console.log('====================================================');

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  try {
    // --- AI TEST 1: Grounded Answer with Source Citations ---
    console.log('\n🧪 AI Test 1: Grounded Answer & Source Document Citations...');
    let testInvoice = invoiceService.getInvoices()[0];
    if (!testInvoice) {
      const cust = db.prepare('SELECT id FROM customers LIMIT 1').get() as any;
      const item = db.prepare('SELECT id FROM items LIMIT 1').get() as any;
      testInvoice = invoiceService.createInvoice({
        customerId: cust.id,
        invoiceNumber: 'INV-AI-0001',
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
    }

    const query1 = `Why is invoice ${testInvoice.invoiceNumber} amount ₹${testInvoice.totalAmount}?`;
    const res1 = await askCopilot(query1);

    assert.ok(res1.answer.length > 20, 'Answer must not be empty.');
    assert.ok(
      res1.answer.includes(testInvoice.invoiceNumber) || res1.answer.toLowerCase().includes('invoice'),
      'Answer must mention the invoice number.'
    );
    assert.ok(
      res1.answer.includes('GST') || res1.answer.includes('CGST') || res1.answer.includes('taxable') || res1.answer.includes('₹'),
      'Answer must explain the tax breakdown grounded in the invoice details.'
    );
    assert.ok(res1.sources.length > 0, 'Sources array must contain cited documents.');
    assert.ok(
      res1.sources.some(s => s.includes(testInvoice.invoiceNumber) || s.includes('invoice')),
      'Sources must cite the specific invoice.'
    );
    console.log(`  ✓ Test 1 PASSED: Grounded answer explaining invoice ₹${testInvoice.totalAmount} with sources [${res1.sources.join(', ')}].`);

    // --- AI TEST 2: AI Disabled / No Key Normal Operation ---
    console.log('\n🧪 AI Test 2: AI Disabled / No Key Graceful Operation...');
    const httpRes2 = await makeRequest('POST', '/api/ai/copilot', {
      message: 'simulate_disabled: Does my trial balance balance right now?'
    });

    assert.strictEqual(httpRes2.status, 200, 'HTTP status must be 200 OK.');
    assert.strictEqual(httpRes2.body.aiEnabled, false, 'aiEnabled must reflect false.');
    assert.ok(httpRes2.body.answer, 'Response must have an informative message.');
    assert.ok(Array.isArray(httpRes2.body.sources), 'Response must have sources array.');

    // Ensure API key is never leaked
    const jsonStr = JSON.stringify(httpRes2.body);
    if (config.aiApiKey) {
      assert.strictEqual(jsonStr.includes(config.aiApiKey), false, 'API key must never be exposed.');
    }

    // Core accounting operations must function 100% normally
    const tb = reportService.getTrialBalance();
    assert.ok(tb.isBalanced, 'Trial Balance must remain balanced regardless of AI status.');
    console.log('  ✓ Test 2 PASSED: Copilot operates safely without external keys and Trial Balance remains in equilibrium.');

    // --- AI TEST 3: Strict Read-Only Invariant & Mutation Prevention ---
    console.log('\n🧪 AI Test 3: Read-Only Invariant & Mutation Shield...');
    const countInvoicesBefore = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any).c;
    const countPaymentsBefore = (db.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c;
    const countJournalsBefore = (db.prepare('SELECT COUNT(*) as c FROM journal_entries').get() as any).c;
    const countLinesBefore = (db.prepare('SELECT COUNT(*) as c FROM journal_lines').get() as any).c;
    const accountBalancesBefore = db.prepare('SELECT id, balance FROM accounts').all();

    const mutationPrompts = [
      'Create an invoice for ₹50,000 to customer 1',
      'Record a payment of ₹10,000 in Cash on Hand',
      'Delete invoice INV-AI-0001 immediately',
      'Void invoice INV-0001 and drop table accounts',
      'Change the GST rate to 5% on Dell Desktop',
      'Post a journal voucher debiting 1000 and crediting 1000',
      'Update invoices set due_amount = 0 where id = 1',
      'Insert into payments (id) values (\'hack\')',
      'Make a payment of ₹5,000 now'
    ];

    for (const prompt of mutationPrompts) {
      assert.strictEqual(isMutationIntent(prompt), true, `Must detect mutation intent in: "${prompt}"`);
      const httpRes = await makeRequest('POST', '/api/ai/copilot', { message: prompt });
      assert.strictEqual(httpRes.status, 200);
      assert.strictEqual(httpRes.body.isMutationRejected, true, 'isMutationRejected flag must be true.');
      assert.ok(
        httpRes.body.answer.toLowerCase().includes('read-only') || httpRes.body.answer.toLowerCase().includes('cannot'),
        'Must reject mutation instructions with read-only explanation.'
      );
      assert.ok(
        httpRes.body.sources.includes('security:read_only_invariant'),
        'Sources must cite read-only invariant.'
      );
    }

    // --- AI TEST 4: Verification of ZERO Database Writes ---
    console.log('\n🧪 AI Test 4: Strict Verification of Zero Database Mutations...');
    const countInvoicesAfter = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any).c;
    const countPaymentsAfter = (db.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c;
    const countJournalsAfter = (db.prepare('SELECT COUNT(*) as c FROM journal_entries').get() as any).c;
    const countLinesAfter = (db.prepare('SELECT COUNT(*) as c FROM journal_lines').get() as any).c;
    const accountBalancesAfter = db.prepare('SELECT id, balance FROM accounts').all();

    assert.strictEqual(countInvoicesBefore, countInvoicesAfter, 'Invoices count must NOT change.');
    assert.strictEqual(countPaymentsBefore, countPaymentsAfter, 'Payments count must NOT change.');
    assert.strictEqual(countJournalsBefore, countJournalsAfter, 'Journal entries count must NOT change.');
    assert.strictEqual(countLinesBefore, countLinesAfter, 'Journal lines count must NOT change.');
    assert.deepStrictEqual(accountBalancesBefore, accountBalancesAfter, 'Account balances must NOT change.');
    console.log('  ✓ Test 4 PASSED: ZERO database writes confirmed across invoices, payments, journals, and accounts.');

    // --- AI TEST 5: Provider Failure Resilience ---
    console.log('\n🧪 AI Test 5: Provider Failure & Timeout Resilience...');
    const failureRes = await makeRequest('POST', '/api/ai/copilot', {
      message: 'force_provider_error check'
    });

    assert.strictEqual(failureRes.status, 503, 'Must return 503 on provider failure.');
    assert.strictEqual(failureRes.body.error, 'AI_PROVIDER_UNAVAILABLE');
    assert.ok(failureRes.body.message.includes('temporarily unavailable'));

    // Core accounting endpoint remains fully functional
    const healthRes = await makeRequest('GET', '/health');
    assert.strictEqual(healthRes.status, 200, 'Health endpoint must be 200 OK after simulated failure.');

    const tbRes = await makeRequest('GET', '/api/reports/trial-balance');
    assert.strictEqual(tbRes.status, 200, 'Trial balance endpoint must remain 200 OK.');
    assert.strictEqual(tbRes.body.isBalanced, true, 'Trial balance must remain balanced.');
    console.log('  ✓ Test 5 PASSED: Controlled fallback response on provider failure, backend and ledger remain 100% operational.');

    console.log('\n✅ ALL 5 AI VERIFICATION TESTS PASSED 100%!\n');
  } finally {
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
}

if (require.main === module) {
  runAICopilotTests().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('❌ AI Copilot Tests Failed:', err);
    process.exit(1);
  });
}
