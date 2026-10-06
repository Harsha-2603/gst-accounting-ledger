import assert from 'assert';
import { TestHarness } from './testHarness';
import {
  createBalancedTransactionFixture,
  createUnbalancedTransactionFixture,
  createIntraStateInvoiceFixture,
  createInterStateInvoiceFixture,
  recordFullPaymentFixture,
  recordPartialPaymentFixture,
  voidInvoiceFixture,
  repeatedVoidAttemptFixture,
  randomizedSequence20OperationsFixture
} from '../fixtures/accountingFixtures';

export async function runHarnessScenariosTests(): Promise<{ passed: number; failed: number }> {
  console.log('====================================================');
  console.log('🧪 AUTOMATED TEST HARNESS & SCENARIOS FIXTURE SUITE');
  console.log('====================================================\n');

  const harness = new TestHarness();
  await harness.start();
  harness.resetDb();

  let passed = 0;
  let failed = 0;

  async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
    process.stdout.write(`  ▶ SCENARIO: ${name}... `);
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
    // Scenario 1: Balanced Transaction
    await scenario('1. Balanced Transaction Fixture', async () => {
      const result = await createBalancedTransactionFixture(harness, { amount: 25000.0 });
      assert.strictEqual(result.validation.isBalanced, true);
      assert.strictEqual(result.validation.difference, '0.0000');
      assert.ok(result.entry.id);
    });

    // Scenario 2: Intentionally Unbalanced Transaction
    await scenario('2. Intentionally Unbalanced Transaction Fixture (HTTP 422 & 0 writes)', async () => {
      const result = await createUnbalancedTransactionFixture(harness, {
        debitAmount: 1180.0,
        creditAmount: 1000.0
      });
      assert.strictEqual(result.response.status, 422);
      assert.strictEqual(result.rowsWritten, 0);
    });

    // Scenario 3: Intra-State GST Invoice (50/50 Dual Split)
    await scenario('3. Intra-State GST Invoice Fixture (Maharashtra 27 -> 27)', async () => {
      const result = await createIntraStateInvoiceFixture(harness, {
        unitPrice: 50000.0,
        quantity: 2,
        taxRate: 18.0
      });
      assert.strictEqual(result.invoice.subtotal, 100000.0);
      assert.strictEqual(result.invoice.cgstAmount, 9000.0);
      assert.strictEqual(result.invoice.sgstAmount, 9000.0);
      assert.strictEqual(result.invoice.igstAmount, 0.0);
      assert.strictEqual(result.invoice.totalAmount, 118000.0);
    });

    // Scenario 4: Inter-State GST Invoice (100% IGST)
    await scenario('4. Inter-State GST Invoice Fixture (Maharashtra 27 -> Gujarat 24)', async () => {
      const result = await createInterStateInvoiceFixture(harness, {
        unitPrice: 40000.0,
        quantity: 1,
        taxRate: 18.0
      });
      assert.strictEqual(result.invoice.subtotal, 40000.0);
      assert.strictEqual(result.invoice.cgstAmount, 0.0);
      assert.strictEqual(result.invoice.sgstAmount, 0.0);
      assert.strictEqual(result.invoice.igstAmount, 7200.0);
      assert.strictEqual(result.invoice.totalAmount, 47200.0);
    });

    // Scenario 5: Full Payment Settlement
    await scenario('5. Full Payment Settlement Fixture (AR Relieved to 0.00)', async () => {
      const inv = await createIntraStateInvoiceFixture(harness, { unitPrice: 15000.0 });
      const result = await recordFullPaymentFixture(harness, inv.invoice.id);
      assert.strictEqual(result.settledInvoice.isFullyPaid, true);
      assert.strictEqual(result.settledInvoice.dueAmount, 0.0);
    });

    // Scenario 6: Partial Payment
    await scenario('6. Partial Payment Fixture (Due Decreased, Partial Debt Outstanding)', async () => {
      const inv = await createIntraStateInvoiceFixture(harness, { unitPrice: 30000.0 });
      const result = await recordPartialPaymentFixture(harness, inv.invoice.id, 10000.0);
      assert.strictEqual(result.settledInvoice.isFullyPaid, false);
      assert.strictEqual(result.settledInvoice.dueAmount, inv.invoice.totalAmount - 10000.0);
    });

    // Scenario 7: Invoice Void / Reversal
    let voidedInvoiceId = '';
    await scenario('7. Invoice Void & Reversal Fixture (Append-only contra-entries, zero row deletion)', async () => {
      const inv = await createInterStateInvoiceFixture(harness, { unitPrice: 20000.0 });
      voidedInvoiceId = inv.invoice.id;
      const result = await voidInvoiceFixture(harness, voidedInvoiceId, { reason: 'Order Cancelled' });
      assert.strictEqual(result.voidResponse.status, 'VOIDED');
      assert.strictEqual(result.voidResponse.dueAmount, 0.0);
      assert.ok(result.reversalLinesCount > 0, 'Reversal lines must be appended');
    });

    // Scenario 8: Repeated Void Attempt
    await scenario('8. Repeated Void Attempt Fixture (Safely rejected with HTTP 400)', async () => {
      const res = await repeatedVoidAttemptFixture(harness, voidedInvoiceId);
      assert.strictEqual(res.status, 400);
    });

    // Scenario 9: Randomized Sequence of 20 Valid Operations
    await scenario('9. Randomized Sequence of 20 Valid Operations (Trial Balance Equilibrium Verified)', async () => {
      const result = await randomizedSequence20OperationsFixture(harness, 100);
      assert.strictEqual(result.operationsExecuted, 20);
      assert.strictEqual(result.trialBalance.isBalanced, true);
      assert.strictEqual(result.trialBalance.difference, 0.0);
      assert.strictEqual(result.trialBalance.totalDebit, result.trialBalance.totalCredit);
    });

  } finally {
    await harness.stop();
  }

  console.log('\n====================================================');
  console.log(`HARNESS SCENARIOS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    throw new Error(`${failed} harness scenario test(s) failed.`);
  }

  return { passed, failed };
}

if (require.main === module) {
  runHarnessScenariosTests().catch(err => {
    console.error('\n❌ HARNESS SCENARIOS TEST SUITE FAILED:', err.message);
    process.exit(1);
  });
}
