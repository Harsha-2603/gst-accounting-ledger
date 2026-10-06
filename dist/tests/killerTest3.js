"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runKillerTest3 = runKillerTest3;
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const server_1 = __importDefault(require("../server"));
const database_1 = require("../database");
function makeRequest(baseUrl, method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const reqHeaders = { 'Content-Type': 'application/json' };
        const payload = body ? JSON.stringify(body) : undefined;
        if (payload)
            reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
        const req = http_1.default.request(url, { method, headers: reqHeaders }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = data;
                try {
                    parsed = JSON.parse(data);
                }
                catch (e) { }
                resolve({ status: res.statusCode || 500, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
async function runKillerTest3() {
    console.log('----------------------------------------------------');
    console.log('🎯 KILLER TEST 3: Trial Balance Equilibrium Across 20 Operations');
    console.log('----------------------------------------------------');
    console.log('Rule: Start with an empty ledger, execute 20 valid operations, and verify Trial Balance equilibrium via GET /api/reports/trial-balance.\n');
    // 1. Start with an empty ledger
    console.log('  1. Resetting database to an empty ledger state...');
    (0, database_1.resetLedger)();
    // Start HTTP Server
    const server = server_1.default.listen(0, '127.0.0.1');
    await new Promise((res) => server.once('listening', res));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    try {
        // Verify initial empty ledger trial balance
        const initTbRes = await makeRequest(baseUrl, 'GET', '/api/reports/trial-balance');
        assert_1.default.strictEqual(initTbRes.status, 200);
        assert_1.default.strictEqual(initTbRes.body.isBalanced, true, 'Initial empty ledger must be balanced');
        assert_1.default.strictEqual(initTbRes.body.difference, 0.00, 'Initial difference must be 0.0000');
        assert_1.default.strictEqual(initTbRes.body.totalDebit, 0.00, 'Initial total debit must be 0.00');
        assert_1.default.strictEqual(initTbRes.body.totalCredit, 0.00, 'Initial total credit must be 0.00');
        console.log('  ✓ 1. Verified initial empty ledger Trial Balance is balanced at ₹0.00.');
        const activeInvoices = [];
        const operationLog = [];
        // 2. Execute 20 valid randomized operations
        console.log('\n  2. Executing 20 valid randomized operations (Invoices, Payments, Voids)...');
        for (let i = 1; i <= 20; i++) {
            const opType = i % 5;
            switch (opType) {
                case 1: { // 1. Intra-State Sales Invoice
                    const invNum = `INV-KT3-INTRA-${i}-${Date.now().toString().slice(-4)}`;
                    const res = await makeRequest(baseUrl, 'POST', '/api/invoices', {
                        customerId: 'cust_intra_27',
                        invoiceDate: '2026-10-06',
                        dueDate: '2026-11-06',
                        invoiceNumber: invNum,
                        deliver: true,
                        lines: [
                            { itemId: 'item_pc_8471', description: 'Intra-State Desktop PC', hsnCode: '8471', quantity: i, unitPrice: 2500.00 * i, taxRate: 18.00 }
                        ]
                    });
                    assert_1.default.strictEqual(res.status, 201, `Operation ${i} must succeed with 201`);
                    activeInvoices.push(res.body);
                    operationLog.push(`Op ${i}: Issued Intra-State Invoice ${invNum} (Total: ₹${res.body.totalAmount})`);
                    break;
                }
                case 2: { // 2. Inter-State Sales Invoice
                    const invNum = `INV-KT3-INTER-${i}-${Date.now().toString().slice(-4)}`;
                    const res = await makeRequest(baseUrl, 'POST', '/api/invoices', {
                        customerId: 'cust_inter_24',
                        invoiceDate: '2026-10-06',
                        dueDate: '2026-11-06',
                        invoiceNumber: invNum,
                        deliver: true,
                        lines: [
                            { itemId: 'item_paper_4802', description: 'Inter-State Paper Shipment', hsnCode: '4802', quantity: i * 3, unitPrice: 400.00, taxRate: 12.00 }
                        ]
                    });
                    assert_1.default.strictEqual(res.status, 201, `Operation ${i} must succeed with 201`);
                    activeInvoices.push(res.body);
                    operationLog.push(`Op ${i}: Issued Inter-State Invoice ${invNum} (Total: ₹${res.body.totalAmount})`);
                    break;
                }
                case 3: { // 3. Partial Customer Payment
                    const openInv = activeInvoices.find(inv => inv.dueAmount > 0 && inv.status === 'DELIVERED');
                    if (openInv) {
                        const payAmt = Math.floor(openInv.dueAmount / 2);
                        if (payAmt > 0) {
                            const res = await makeRequest(baseUrl, 'POST', '/api/payments', {
                                customerId: openInv.customerId,
                                paymentDate: '2026-10-06',
                                amount: payAmt,
                                depositAccountId: 'acc_bank_1010',
                                referenceNumber: `NEFT-PARTIAL-KT3-${i}`,
                                allocations: [{ invoiceId: openInv.id, amount: payAmt }]
                            });
                            assert_1.default.strictEqual(res.status, 201);
                            openInv.dueAmount -= payAmt;
                            openInv.paidAmount += payAmt;
                            operationLog.push(`Op ${i}: Partial Payment ₹${payAmt} on Invoice ${openInv.invoiceNumber}`);
                        }
                    }
                    else {
                        operationLog.push(`Op ${i}: Skipped partial payment (no open delivered invoice)`);
                    }
                    break;
                }
                case 4: { // 4. Full Customer Payment
                    const openInv = activeInvoices.find(inv => inv.dueAmount > 0 && inv.status === 'DELIVERED');
                    if (openInv) {
                        const payAmt = openInv.dueAmount;
                        const res = await makeRequest(baseUrl, 'POST', '/api/payments', {
                            customerId: openInv.customerId,
                            paymentDate: '2026-10-06',
                            amount: payAmt,
                            depositAccountId: 'acc_cash_1000',
                            referenceNumber: `CASH-FULL-KT3-${i}`,
                            allocations: [{ invoiceId: openInv.id, amount: payAmt }]
                        });
                        assert_1.default.strictEqual(res.status, 201);
                        openInv.dueAmount = 0;
                        openInv.paidAmount += payAmt;
                        openInv.status = 'PAID';
                        operationLog.push(`Op ${i}: Full Settlement ₹${payAmt} on Invoice ${openInv.invoiceNumber}`);
                    }
                    else {
                        operationLog.push(`Op ${i}: Skipped full payment (no open delivered invoice)`);
                    }
                    break;
                }
                case 0: { // 5. Void Unpaid Invoice
                    const unpaidInv = activeInvoices.find(inv => inv.status === 'DELIVERED' && inv.paidAmount === 0);
                    if (unpaidInv) {
                        const res = await makeRequest(baseUrl, 'POST', `/api/invoices/${unpaidInv.id}/void`, {
                            reason: `Random void op ${i}`
                        });
                        if (res.status === 200) {
                            unpaidInv.status = 'VOIDED';
                            unpaidInv.dueAmount = 0;
                            operationLog.push(`Op ${i}: Voided Invoice ${unpaidInv.invoiceNumber}`);
                        }
                        else {
                            operationLog.push(`Op ${i}: Void attempt skipped (HTTP ${res.status})`);
                        }
                    }
                    else {
                        operationLog.push(`Op ${i}: Skipped void (no unpaid delivered invoice)`);
                    }
                    break;
                }
            }
            // Verify intermediate equilibrium after every single operation
            const stepTb = await makeRequest(baseUrl, 'GET', '/api/reports/trial-balance');
            assert_1.default.strictEqual(stepTb.status, 200);
            assert_1.default.strictEqual(stepTb.body.isBalanced, true, `Trial Balance MUST remain balanced after operation ${i}`);
            assert_1.default.strictEqual(stepTb.body.difference, 0.00, `Difference MUST be 0.0000 after operation ${i}`);
        }
        // 3. Call GET /api/reports/trial-balance after all 20 operations
        console.log('\n  3. Calling GET /api/reports/trial-balance to verify final ledger state...');
        const finalTbRes = await makeRequest(baseUrl, 'GET', '/api/reports/trial-balance');
        assert_1.default.strictEqual(finalTbRes.status, 200, 'Trial Balance endpoint must respond with HTTP 200');
        const finalTb = finalTbRes.body;
        console.log('\n  Executed Operations Summary:');
        operationLog.forEach(log => console.log(`    • ${log}`));
        console.log('\n  Final Trial Balance Verification:');
        console.log(`    • Grand Total Debit:  ₹${finalTb.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        console.log(`    • Grand Total Credit: ₹${finalTb.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        console.log(`    • Difference:         ${finalTb.difference.toFixed(4)}`);
        console.log(`    • Equilibrium Status: ${finalTb.isBalanced ? 'BALANCED (TRUE)' : 'UNBALANCED (FALSE)'}`);
        // Verify invariants: totalDebit == totalCredit and difference == 0.0000
        assert_1.default.strictEqual(finalTb.totalDebit, finalTb.totalCredit, 'totalDebit MUST equal totalCredit!');
        assert_1.default.strictEqual(finalTb.difference, 0.00, 'difference MUST equal 0.0000!');
        assert_1.default.strictEqual(finalTb.isBalanced, true, 'isBalanced MUST be true!');
        // Verify account-level totals (sum of account debits == totalDebit, sum of account credits == totalCredit)
        let sumAccDebits = 0;
        let sumAccCredits = 0;
        finalTb.accounts.forEach((acc) => {
            sumAccDebits += acc.debit;
            sumAccCredits += acc.credit;
        });
        assert_1.default.strictEqual(sumAccDebits, finalTb.totalDebit, 'Sum of account debits must equal grand total debit');
        assert_1.default.strictEqual(sumAccCredits, finalTb.totalCredit, 'Sum of account credits must equal grand total credit');
        console.log('  ✓ Verified account-level totals match grand total debit and grand total credit.');
    }
    finally {
        server.close();
    }
    console.log('\n✅ KILLER TEST 3 PASSED: GET /api/reports/trial-balance verified totalDebit == totalCredit (difference == 0.0000) and account-level totals across 20 operations.\n');
}
if (require.main === module) {
    runKillerTest3().catch(err => {
        console.error('\n❌ KILLER TEST 3 FAILED:', err.message);
        process.exit(1);
    });
}
