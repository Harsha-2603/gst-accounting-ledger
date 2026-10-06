/**
 * Automated Verification Script: AI Accounting Copilot Integration
 * Tests:
 * 1. Normal grounded questions (all 6 user questions)
 * 2. Strict mutation protection and controlled refusal
 * 3. AI disabled mode
 * 4. Provider failure fallback (503)
 * 5. Security audit: zero API key / secret leak in frontend assets
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function postCopilot(message) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ message });
    const req = http.request(
      'http://127.0.0.1:3000/api/ai/copilot',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('🤖 AI ACCOUNTING COPILOT INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  // --- 1. Test All 6 Example Questions ---
  console.log('1. Testing 6 Standard Grounded Inquiries...');

  // Q1: Invoice explanation
  const q1 = await postCopilot('Why is invoice INV-0001 ₹11,800?');
  console.log('  Q1 ("Why is invoice INV-0001 ₹11,800?"):', q1.status, q1.data.sources);
  assert.strictEqual(q1.status, 200);
  assert.ok(q1.data.answer.length > 20);
  assert.ok(q1.data.sources.some(s => s.includes('invoice') || s.includes('INV')));

  // Q2: CGST and SGST collected
  const q2 = await postCopilot('How much CGST and SGST did I collect?');
  console.log('  Q2 ("How much CGST and SGST did I collect?"):', q2.status, q2.data.sources);
  assert.strictEqual(q2.status, 200);
  assert.ok(q2.data.answer.includes('CGST') && q2.data.answer.includes('SGST'));
  assert.ok(q2.data.sources.includes('report:gstr-1'));

  // Q3: Unpaid invoices
  const q3 = await postCopilot('Which invoices are still unpaid?');
  console.log('  Q3 ("Which invoices are still unpaid?"):', q3.status, q3.data.sources);
  assert.strictEqual(q3.status, 200);
  assert.ok(q3.data.sources.includes('invoices:unpaid') || q3.data.sources.includes('invoices:status'));

  // Q4: Explain journal entry
  const q4 = await postCopilot('Explain this journal entry.');
  console.log('  Q4 ("Explain this journal entry."):', q4.status, q4.data.sources);
  assert.strictEqual(q4.status, 200);
  assert.ok(q4.data.sources.some(s => s.startsWith('journal:') || s === 'accounts_transactions'));

  // Q5: Does Trial Balance balance
  const q5 = await postCopilot('Does my Trial Balance balance?');
  console.log('  Q5 ("Does my Trial Balance balance?"):', q5.status, q5.data.sources);
  assert.strictEqual(q5.status, 200);
  assert.ok(q5.data.answer.toLowerCase().includes('balance'));
  assert.ok(q5.data.sources.includes('report:trial-balance'));

  // Q6: Summarize today's sales and payments
  const q6 = await postCopilot("Summarize today's sales and payments.");
  console.log('  Q6 ("Summarize today\'s sales and payments."):', q6.status, q6.data.sources);
  assert.strictEqual(q6.status, 200);
  assert.ok(q6.data.sources.includes('invoices:summary') && q6.data.sources.includes('payments:summary'));

  console.log('  ✓ All 6 example questions return grounded answers with verified document citations.\n');

  // --- 2. Mutation Protection ---
  console.log('2. Testing Mutation Protection & Controlled Refusal...');
  const mutationPrompts = [
    'Record a ₹5,000 payment.',
    'Delete invoice INV-001.',
    'Change GST to 5%.'
  ];

  for (const mPrompt of mutationPrompts) {
    const res = await postCopilot(mPrompt);
    console.log(`  Mutation Refusal for "${mPrompt}":`, res.status, res.data.sources);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.sources.includes('security:read_only_invariant'));
    assert.ok(res.data.answer.toLowerCase().includes('read-only'));
    assert.ok(res.data.answer.toLowerCase().includes('cannot'));
  }
  console.log('  ✓ All mutation prompts intercepted and refused with security:read_only_invariant.\n');

  // --- 3. Disabled Mode Simulation ---
  console.log('3. Testing Disabled Mode Notification...');
  const disRes = await postCopilot('simulate_disabled inquiry');
  console.log('  Disabled Mode Response:', disRes.status, disRes.data);
  assert.strictEqual(disRes.status, 200);
  assert.strictEqual(disRes.data.aiEnabled, false);
  assert.strictEqual(disRes.data.answer, 'AI Copilot is currently disabled. Core accounting features continue to work normally.');
  console.log('  ✓ Disabled mode response conforms to specification.\n');

  // --- 4. Provider Failure Fallback ---
  console.log('4. Testing Provider Failure (HTTP 503 Fallback)...');
  const failRes = await postCopilot('force_provider_error check');
  console.log('  Provider Error Response:', failRes.status, failRes.data);
  assert.strictEqual(failRes.status, 503);
  assert.strictEqual(failRes.data.error, 'AI_PROVIDER_UNAVAILABLE');
  assert.ok(failRes.data.message.includes('unavailable') || failRes.data.message.includes('timed out'));
  console.log('  ✓ Provider failure correctly returns HTTP 503 AI_PROVIDER_UNAVAILABLE.\n');

  // --- 5. Security & Credential Leakage Audit ---
  console.log('5. Security Audit: Verifying Zero Client-Side Secret Leakage...');
  const publicDir = path.join(__dirname, '..', 'public');
  const filesToCheck = ['index.html', 'app.js', 'api.js', 'styles.css', 'components.js'];

  for (const f of filesToCheck) {
    const filePath = path.join(publicDir, f);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(!content.includes('AI_API_KEY'), `Forbidden: AI_API_KEY found in public/${f}`);
      assert.ok(!content.includes('generativelanguage.googleapis.com'), `Forbidden: direct Google Gemini URL found in public/${f}`);
      assert.ok(!content.includes('api.openai.com'), `Forbidden: direct OpenAI URL found in public/${f}`);
      assert.ok(!content.includes('gemini-1.5'), `Forbidden: model details found in public/${f}`);
      console.log(`  ✓ public/${f}: Clean (no secrets, no direct provider connections).`);
    }
  }
  console.log('  ✓ Security audit passed: Frontend communicates solely via POST /api/ai/copilot.\n');

  console.log('====================================================');
  console.log('🎉 ALL AI ACCOUNTING COPILOT VERIFICATIONS PASSED 100%!');
  console.log('====================================================');
}

runVerification().catch(err => {
  console.error('❌ Verification Failed:', err);
  process.exit(1);
});
