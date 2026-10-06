"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAccountingCoreUnitTests = runAccountingCoreUnitTests;
const assert_1 = __importDefault(require("assert"));
const gstEngine_1 = require("../domain/gstEngine");
const invariantGuard_1 = require("../domain/invariantGuard");
const ledgerService = __importStar(require("../services/ledgerService"));
const database_1 = require("../database");
const errors_1 = require("../errors");
async function runAccountingCoreUnitTests() {
    console.log('🧪 Running Focused Unit Tests for Deterministic Accounting Core...\n');
    // Test 1: CGST/SGST Split (Intra-State)
    console.log('  Testing 1: CGST/SGST split (Intra-State 18%)...');
    const intraResult = (0, gstEngine_1.calculateGST)('27', '27', [
        { itemId: 'item_1', description: 'Dell PC', hsnCode: '8471', quantity: 1, unitPrice: 10000.00, taxRate: 18.00 }
    ]);
    assert_1.default.strictEqual(intraResult.isIntraState, true);
    assert_1.default.strictEqual(intraResult.subtotal, '10000.0000');
    assert_1.default.strictEqual(intraResult.cgstAmount, '900.0000');
    assert_1.default.strictEqual(intraResult.sgstAmount, '900.0000');
    assert_1.default.strictEqual(intraResult.igstAmount, '0.0000');
    assert_1.default.strictEqual(intraResult.totalAmount, '11800.0000');
    const line1 = intraResult.processedLines[0];
    assert_1.default.strictEqual(line1.cgstRate, '9.00');
    assert_1.default.strictEqual(line1.sgstRate, '9.00');
    assert_1.default.strictEqual(line1.igstRate, '0.00');
    console.log('  ✓ Test 1 PASSED: CGST (9%) and SGST (9%) split correctly for intra-state supply.');
    // Test 2: IGST Calculation (Inter-State)
    console.log('  Testing 2: IGST calculation (Inter-State 18%)...');
    const interResult = (0, gstEngine_1.calculateGST)('27', '24', [
        { itemId: 'item_1', description: 'Dell PC', hsnCode: '8471', quantity: 1, unitPrice: 10000.00, taxRate: 18.00 }
    ]);
    assert_1.default.strictEqual(interResult.isIntraState, false);
    assert_1.default.strictEqual(interResult.subtotal, '10000.0000');
    assert_1.default.strictEqual(interResult.cgstAmount, '0.0000');
    assert_1.default.strictEqual(interResult.sgstAmount, '0.0000');
    assert_1.default.strictEqual(interResult.igstAmount, '1800.0000');
    assert_1.default.strictEqual(interResult.totalAmount, '11800.0000');
    const line2 = interResult.processedLines[0];
    assert_1.default.strictEqual(line2.cgstRate, '0.00');
    assert_1.default.strictEqual(line2.sgstRate, '0.00');
    assert_1.default.strictEqual(line2.igstRate, '18.00');
    console.log('  ✓ Test 2 PASSED: 100% IGST (18%) allocated correctly for inter-state supply.');
    // Test 3: Zero-Tax Transaction (0% GST Slab)
    console.log('  Testing 3: Zero-Tax transaction (0% GST slab)...');
    const zeroTaxResult = (0, gstEngine_1.calculateGST)('27', '27', [
        { itemId: 'item_zero', description: 'Exempted Food Grains', hsnCode: '1001', quantity: 10, unitPrice: 500.00, taxRate: 0.00 }
    ]);
    assert_1.default.strictEqual(zeroTaxResult.subtotal, '5000.0000');
    assert_1.default.strictEqual(zeroTaxResult.cgstAmount, '0.0000');
    assert_1.default.strictEqual(zeroTaxResult.sgstAmount, '0.0000');
    assert_1.default.strictEqual(zeroTaxResult.igstAmount, '0.0000');
    assert_1.default.strictEqual(zeroTaxResult.totalAmount, '5000.0000');
    console.log('  ✓ Test 3 PASSED: Zero-tax (0% slab) handled cleanly with zero tax liabilities.');
    // Test 4: Balanced Journal Accepted
    console.log('  Testing 4: Balanced journal accepted...');
    const balancedLines = [
        { accountId: 'acc_ar_1200', debit: '1180.0000', credit: '0.0000', description: 'AR Debit' },
        { accountId: 'acc_sales_4000', debit: '0.0000', credit: '1000.0000', description: 'Sales Revenue' },
        { accountId: 'acc_cgst_2110', debit: '0.0000', credit: '90.0000', description: 'CGST' },
        { accountId: 'acc_sgst_2120', debit: '0.0000', credit: '90.0000', description: 'SGST' }
    ];
    const validationRes = (0, invariantGuard_1.validateJournalBalance)(balancedLines);
    assert_1.default.strictEqual(validationRes.isBalanced, true);
    assert_1.default.strictEqual(validationRes.difference, '0.0000');
    const posted = ledgerService.postJournalEntry({
        entryDate: '2026-10-06',
        entryType: 'MANUAL',
        lines: balancedLines
    });
    assert_1.default.ok(posted.id, 'Journal entry ID must be returned');
    console.log('  ✓ Test 4 PASSED: Balanced journal accepted and posted to ledger.');
    // Test 5: Unbalanced Journal Rejected
    console.log('  Testing 5: Unbalanced journal rejected (0.0001 tolerance check & 0 writes)...');
    const unbalancedLines = [
        { accountId: 'acc_ar_1200', debit: '1180.0000', credit: '0.0000' },
        { accountId: 'acc_sales_4000', debit: '0.0000', credit: '1000.0000' }
    ];
    const initialCount = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get().cnt;
    let errorCaught = false;
    try {
        ledgerService.postJournalEntry({
            entryDate: '2026-10-06',
            entryType: 'MANUAL',
            lines: unbalancedLines
        });
    }
    catch (err) {
        errorCaught = true;
        assert_1.default.strictEqual(err instanceof errors_1.UnbalancedTransactionError, true);
        assert_1.default.strictEqual(err.statusCode, 422);
        assert_1.default.strictEqual(err.difference, '180.0000');
    }
    assert_1.default.strictEqual(errorCaught, true, 'Must catch UnbalancedTransactionError');
    const finalCount = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get().cnt;
    assert_1.default.strictEqual(initialCount, finalCount, 'Zero ledger entries written on unbalanced payload.');
    console.log('  ✓ Test 5 PASSED: Unbalanced journal rejected with HTTP 422 and wrote 0 rows.');
    // Test 6: Floating/Rounding Edge Cases
    console.log('  Testing 6: Floating/rounding edge cases (Odd amount ₹333.33 @ 18% GST)...');
    const edgeCaseResult = (0, gstEngine_1.calculateGST)('27', '27', [
        { itemId: 'item_fractional', description: 'Fractional Unit', hsnCode: '9983', quantity: 1, unitPrice: 333.33, taxRate: 18.00 }
    ]);
    // Taxable: 333.3300. CGST 9%: 29.9997. SGST 9%: 29.9997. Total: 393.3294.
    assert_1.default.strictEqual(edgeCaseResult.subtotal, '333.3300');
    assert_1.default.strictEqual(edgeCaseResult.cgstAmount, '29.9997');
    assert_1.default.strictEqual(edgeCaseResult.sgstAmount, '29.9997');
    assert_1.default.strictEqual(edgeCaseResult.totalAmount, '393.3294');
    // Verify journal lines with fractional precision balance down to exact decimal
    const fractionalGlLines = [
        { accountId: 'acc_ar_1200', debit: '393.3294', credit: '0.0000' },
        { accountId: 'acc_sales_4000', debit: '0.0000', credit: '333.3300' },
        { accountId: 'acc_cgst_2110', debit: '0.0000', credit: '29.9997' },
        { accountId: 'acc_sgst_2120', debit: '0.0000', credit: '29.9997' }
    ];
    const edgeValidation = (0, invariantGuard_1.validateJournalBalance)(fractionalGlLines);
    assert_1.default.strictEqual(edgeValidation.isBalanced, true);
    assert_1.default.strictEqual(edgeValidation.difference, '0.0000');
    console.log('  ✓ Test 6 PASSED: Decimal arithmetic handles fractional edge cases with exact paisa precision.');
    console.log('\n✅ ALL 6 FOCUSED UNIT TESTS FOR ACCOUNTING CORE PASSED 100%!');
}
if (require.main === module) {
    runAccountingCoreUnitTests().catch(err => {
        console.error('❌ Accounting Core Unit Tests FAILED:', err);
        process.exit(1);
    });
}
