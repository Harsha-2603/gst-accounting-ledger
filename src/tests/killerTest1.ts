import assert from 'assert';
import http from 'http';
import app from '../server';
import { validateJournalBalance } from '../domain/invariantGuard';
import * as ledgerService from '../services/ledgerService';
import { db } from '../database';
import { UnbalancedTransactionError } from '../errors';

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

export async function runKillerTest1(): Promise<void> {
  console.log('----------------------------------------------------');
  console.log('🎯 KILLER TEST 1: Zero-Trust Transaction Balancing Guard');
  console.log('----------------------------------------------------');
  console.log('Rule: Every committed financial transaction must satisfy Total Debit == Total Credit.');
  console.log('Test payload: Intentionally unbalanced journal (Debit: ₹1,180.00 vs Credit: ₹1,000.00).\n');

  const unbalancedLines = [
    { accountId: 'acc_ar_1200', debit: '1180.0000', credit: '0.0000', description: 'AR Debit' },
    { accountId: 'acc_sales_4000', debit: '0.0000', credit: '1000.0000', description: 'Sales Credit' }
  ];

  // Snapshot initial DB counts and account balances
  const initialEntriesCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  const initialLinesCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;
  const initialAccountsSnapshot = db.prepare('SELECT id, code, name, balance FROM accounts').all() as any[];

  // 1. Pre-Commit Domain Guard Assertion
  let domainErrorCaught = false;
  try {
    validateJournalBalance(unbalancedLines);
  } catch (err: any) {
    domainErrorCaught = true;
    assert.strictEqual(err instanceof UnbalancedTransactionError, true, 'Must throw UnbalancedTransactionError instance');
    assert.strictEqual(err.statusCode, 422, 'Must specify HTTP 422 status code');
    assert.strictEqual(err.errorCode, 'UNPROCESSABLE_ENTITY');
    assert.strictEqual(err.difference, '180.0000', 'Must calculate exact discrepancy difference');
  }
  assert.strictEqual(domainErrorCaught, true, 'Zero-Trust Guard MUST catch and reject unbalanced lines before DB persistence.');
  console.log('  ✓ 1. Domain Guard rejected pre-commit payload (Difference: ₹180.0000).');

  // 2. Ledger Transaction Service Assertion
  let serviceErrorCaught = false;
  try {
    ledgerService.postJournalEntry({
      entryDate: '2026-10-06',
      entryType: 'MANUAL',
      narration: 'Unbalanced payload test',
      lines: unbalancedLines
    });
  } catch (err: any) {
    serviceErrorCaught = true;
    assert.strictEqual(err.statusCode, 422, 'Service boundary must return HTTP 422 error status.');
  }
  assert.strictEqual(serviceErrorCaught, true, 'Ledger Service must abort write on unbalanced payload.');
  console.log('  ✓ 2. Ledger Transaction Service aborted write with HTTP 422 UNPROCESSABLE_ENTITY.');

  // 3. HTTP API Boundary Assertion (POST /api/transactions)
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((res) => server.once('listening', res));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const apiRes = await makeRequest(baseUrl, 'POST', '/api/transactions', {
      entryDate: '2026-10-06',
      entryType: 'MANUAL',
      narration: 'HTTP Unbalanced Test',
      lines: unbalancedLines
    });

    assert.strictEqual(apiRes.status, 422, 'HTTP API must respond with HTTP 422 Status Code');
    assert.strictEqual(apiRes.body.error, 'UNPROCESSABLE_ENTITY');
    console.log('  ✓ 3. HTTP API Endpoint (POST /api/transactions) rejected request with HTTP 422 UNPROCESSABLE_ENTITY.');
  } finally {
    server.close();
  }

  // 4. Database Rows & Account Mutation Invariant Verification
  const finalEntriesCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  const finalLinesCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get() as any).cnt;
  const finalAccountsSnapshot = db.prepare('SELECT id, code, name, balance FROM accounts').all() as any[];

  assert.strictEqual(initialEntriesCount, finalEntriesCount, 'ZERO rows must be written to journal_entries table!');
  assert.strictEqual(initialLinesCount, finalLinesCount, 'ZERO rows must be written to journal_lines table!');
  console.log('  ✓ 4. Verified ZERO rows written to journal_entries and journal_lines tables.');

  // Verify NO account balance mutation
  initialAccountsSnapshot.forEach(initAcc => {
    const finalAcc = finalAccountsSnapshot.find(a => a.id === initAcc.id);
    assert.ok(finalAcc, `Account ${initAcc.code} must exist in final snapshot`);
    assert.strictEqual(initAcc.balance, finalAcc.balance, `Account ${initAcc.code} (${initAcc.name}) balance MUST NOT mutate! (Before: ${initAcc.balance}, After: ${finalAcc.balance})`);
  });
  console.log('  ✓ 5. Verified ZERO account balance mutations across all Chart of Accounts.');

  console.log('\n✅ KILLER TEST 1 PASSED: Unbalanced transaction rejected with HTTP 422, zero rows written, and zero account balance mutations.\n');
}

if (require.main === module) {
  runKillerTest1().catch(err => {
    console.error('\n❌ KILLER TEST 1 FAILED:', err.message);
    process.exit(1);
  });
}
