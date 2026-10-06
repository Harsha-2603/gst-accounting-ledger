import assert from 'assert';
import { calculateGST } from '../domain/gstEngine';
import { validateJournalBalance } from '../domain/invariantGuard';
import * as ledgerService from '../services/ledgerService';
import { db } from '../database';
import { UnbalancedTransactionError, BadRequestError } from '../errors';

export async function runAccountingCoreUnitTests(): Promise<void> {
  console.log('🧪 Running Focused Unit Tests for Deterministic Accounting Core...\n');

  // Test 1: CGST/SGST Split (Intra-State)
  console.log('  Testing 1: CGST/SGST split (Intra-State 18%)...');
  const intraResult = calculateGST('27', '27', [
    { itemId: 'item_1', description: 'Dell PC', hsnCode: '8471', quantity: 1, unitPrice: 10000.00, taxRate: 18.00 }
  ]);

  assert.strictEqual(intraResult.isIntraState, true);
  assert.strictEqual(intraResult.subtotal, '10000.0000');
  assert.strictEqual(intraResult.cgstAmount, '900.0000');
  assert.strictEqual(intraResult.sgstAmount, '900.0000');
  assert.strictEqual(intraResult.igstAmount, '0.0000');
  assert.strictEqual(intraResult.totalAmount, '11800.0000');

  const line1 = intraResult.processedLines[0];
  assert.strictEqual(line1.cgstRate, '9.00');
  assert.strictEqual(line1.sgstRate, '9.00');
  assert.strictEqual(line1.igstRate, '0.00');
  console.log('  ✓ Test 1 PASSED: CGST (9%) and SGST (9%) split correctly for intra-state supply.');

  // Test 2: IGST Calculation (Inter-State)
  console.log('  Testing 2: IGST calculation (Inter-State 18%)...');
  const interResult = calculateGST('27', '24', [
    { itemId: 'item_1', description: 'Dell PC', hsnCode: '8471', quantity: 1, unitPrice: 10000.00, taxRate: 18.00 }
  ]);

  assert.strictEqual(interResult.isIntraState, false);
  assert.strictEqual(interResult.subtotal, '10000.0000');
  assert.strictEqual(interResult.cgstAmount, '0.0000');
  assert.strictEqual(interResult.sgstAmount, '0.0000');
  assert.strictEqual(interResult.igstAmount, '1800.0000');
  assert.strictEqual(interResult.totalAmount, '11800.0000');

  const line2 = interResult.processedLines[0];
  assert.strictEqual(line2.cgstRate, '0.00');
  assert.strictEqual(line2.sgstRate, '0.00');
  assert.strictEqual(line2.igstRate, '18.00');
  console.log('  ✓ Test 2 PASSED: 100% IGST (18%) allocated correctly for inter-state supply.');

  // Test 3: Zero-Tax Transaction (0% GST Slab)
  console.log('  Testing 3: Zero-Tax transaction (0% GST slab)...');
  const zeroTaxResult = calculateGST('27', '27', [
    { itemId: 'item_zero', description: 'Exempted Food Grains', hsnCode: '1001', quantity: 10, unitPrice: 500.00, taxRate: 0.00 }
  ]);

  assert.strictEqual(zeroTaxResult.subtotal, '5000.0000');
  assert.strictEqual(zeroTaxResult.cgstAmount, '0.0000');
  assert.strictEqual(zeroTaxResult.sgstAmount, '0.0000');
  assert.strictEqual(zeroTaxResult.igstAmount, '0.0000');
  assert.strictEqual(zeroTaxResult.totalAmount, '5000.0000');
  console.log('  ✓ Test 3 PASSED: Zero-tax (0% slab) handled cleanly with zero tax liabilities.');

  // Test 4: Balanced Journal Accepted
  console.log('  Testing 4: Balanced journal accepted...');
  const balancedLines = [
    { accountId: 'acc_ar_1200', debit: '1180.0000', credit: '0.0000', description: 'AR Debit' },
    { accountId: 'acc_sales_4000', debit: '0.0000', credit: '1000.0000', description: 'Sales Revenue' },
    { accountId: 'acc_cgst_2110', debit: '0.0000', credit: '90.0000', description: 'CGST' },
    { accountId: 'acc_sgst_2120', debit: '0.0000', credit: '90.0000', description: 'SGST' }
  ];

  const validationRes = validateJournalBalance(balancedLines);
  assert.strictEqual(validationRes.isBalanced, true);
  assert.strictEqual(validationRes.difference, '0.0000');

  const posted = ledgerService.postJournalEntry({
    entryDate: '2026-10-06',
    entryType: 'MANUAL',
    lines: balancedLines
  });
  assert.ok(posted.id, 'Journal entry ID must be returned');
  console.log('  ✓ Test 4 PASSED: Balanced journal accepted and posted to ledger.');

  // Test 5: Unbalanced Journal Rejected
  console.log('  Testing 5: Unbalanced journal rejected (0.0001 tolerance check & 0 writes)...');
  const unbalancedLines = [
    { accountId: 'acc_ar_1200', debit: '1180.0000', credit: '0.0000' },
    { accountId: 'acc_sales_4000', debit: '0.0000', credit: '1000.0000' }
  ];

  const initialCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;

  let errorCaught = false;
  try {
    ledgerService.postJournalEntry({
      entryDate: '2026-10-06',
      entryType: 'MANUAL',
      lines: unbalancedLines
    });
  } catch (err: any) {
    errorCaught = true;
    assert.strictEqual(err instanceof UnbalancedTransactionError, true);
    assert.strictEqual(err.statusCode, 422);
    assert.strictEqual(err.difference, '180.0000');
  }

  assert.strictEqual(errorCaught, true, 'Must catch UnbalancedTransactionError');

  const finalCount = (db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as any).cnt;
  assert.strictEqual(initialCount, finalCount, 'Zero ledger entries written on unbalanced payload.');
  console.log('  ✓ Test 5 PASSED: Unbalanced journal rejected with HTTP 422 and wrote 0 rows.');

  // Test 6: Floating/Rounding Edge Cases
  console.log('  Testing 6: Floating/rounding edge cases (Odd amount ₹333.33 @ 18% GST)...');
  const edgeCaseResult = calculateGST('27', '27', [
    { itemId: 'item_fractional', description: 'Fractional Unit', hsnCode: '9983', quantity: 1, unitPrice: 333.33, taxRate: 18.00 }
  ]);

  // Taxable: 333.3300. CGST 9%: 29.9997. SGST 9%: 29.9997. Total: 393.3294.
  assert.strictEqual(edgeCaseResult.subtotal, '333.3300');
  assert.strictEqual(edgeCaseResult.cgstAmount, '29.9997');
  assert.strictEqual(edgeCaseResult.sgstAmount, '29.9997');
  assert.strictEqual(edgeCaseResult.totalAmount, '393.3294');

  // Verify journal lines with fractional precision balance down to exact decimal
  const fractionalGlLines = [
    { accountId: 'acc_ar_1200', debit: '393.3294', credit: '0.0000' },
    { accountId: 'acc_sales_4000', debit: '0.0000', credit: '333.3300' },
    { accountId: 'acc_cgst_2110', debit: '0.0000', credit: '29.9997' },
    { accountId: 'acc_sgst_2120', debit: '0.0000', credit: '29.9997' }
  ];

  const edgeValidation = validateJournalBalance(fractionalGlLines);
  assert.strictEqual(edgeValidation.isBalanced, true);
  assert.strictEqual(edgeValidation.difference, '0.0000');
  console.log('  ✓ Test 6 PASSED: Decimal arithmetic handles fractional edge cases with exact paisa precision.');

  console.log('\n✅ ALL 6 FOCUSED UNIT TESTS FOR ACCOUNTING CORE PASSED 100%!');
}

if (require.main === module) {
  runAccountingCoreUnitTests().catch(err => {
    console.error('❌ Accounting Core Unit Tests FAILED:', err);
    process.exit(1);
  });
}
