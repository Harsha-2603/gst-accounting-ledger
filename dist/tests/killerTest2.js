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
exports.runKillerTest2 = runKillerTest2;
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const server_1 = __importDefault(require("../server"));
const reportService = __importStar(require("../services/reportService"));
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
async function runKillerTest2() {
    console.log('----------------------------------------------------');
    console.log('🎯 KILLER TEST 2: Immutable Invoice Reversal Engine');
    console.log('----------------------------------------------------');
    console.log('Rule: Voiding an invoice reverses accounting effect via append-only contra-entries without deleting history.\n');
    // Start HTTP server for testing API boundary
    const server = server_1.default.listen(0, '127.0.0.1');
    await new Promise((res) => server.once('listening', res));
    const addr = server.address();
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
        assert_1.default.strictEqual(invRes.status, 201, 'Must create invoice with HTTP 201');
        const inv = invRes.body;
        assert_1.default.strictEqual(inv.status, 'DELIVERED', 'Invoice status must be DELIVERED');
        assert_1.default.strictEqual(inv.totalAmount, 118000.00, 'Invoice total must be ₹118,000');
        assert_1.default.ok(inv.journalEntryId, 'Delivered invoice must have associated journalEntryId');
        // Verify original journal lines in DB
        const origJournalLines = database_1.db.prepare(`
      SELECT account_id, debit, credit, description FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_order ASC
    `).all(inv.journalEntryId);
        assert_1.default.strictEqual(origJournalLines.length, 4, 'Delivered intra-state invoice must have 4 GL lines (AR, Sales, CGST, SGST)');
        console.log('  ✓ 1. Invoice created & delivered with 4 GL lines (AR DR 118k, Sales CR 100k, CGST CR 9k, SGST CR 9k).');
        // 2. Void the invoice via API
        console.log('  2. Executing void request via HTTP API (POST /api/invoices/:id/void)...');
        const voidRes = await makeRequest(baseUrl, 'POST', `/api/invoices/${inv.id}/void`, {
            reason: 'Audit trial reversal certification'
        });
        assert_1.default.strictEqual(voidRes.status, 200, 'Void request must respond with HTTP 200');
        const voidResult = voidRes.body;
        assert_1.default.strictEqual(voidResult.status, 'VOIDED', 'Invoice status must be updated to VOIDED');
        assert_1.default.strictEqual(voidResult.dueAmount, 0.00, 'Void result due amount must be 0.00');
        assert_1.default.ok(voidResult.reversalJournalEntryId, 'Must issue a reversal journal entry ID');
        console.log(`  ✓ 2. Invoice voided (Status: VOIDED). Reversal Journal Voucher ${voidResult.reversalJournalEntryId} posted.`);
        // 3. Verify original journal lines still exist (Zero SQL DELETE)
        const origLinesAfterVoid = database_1.db.prepare(`
      SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_order ASC
    `).all(inv.journalEntryId);
        assert_1.default.strictEqual(origLinesAfterVoid.length, 4, 'Original journal lines MUST NOT be physically deleted from database!');
        console.log('  ✓ 3. Verified original 4 journal lines remain 100% intact in database (Zero SQL DELETE).');
        // 4. Verify reversal journal lines exist and every debit/credit was exactly reversed
        const reversalEntry = database_1.db.prepare(`
      SELECT * FROM journal_entries WHERE id = ?
    `).get(voidResult.reversalJournalEntryId);
        assert_1.default.strictEqual(reversalEntry.entry_type, 'REVERSAL', 'Reversal entry must be marked REVERSAL');
        assert_1.default.strictEqual(reversalEntry.reference_id, inv.id, 'Reversal entry must reference original invoice ID');
        const reversalLines = database_1.db.prepare(`
      SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_order ASC
    `).all(voidResult.reversalJournalEntryId);
        assert_1.default.strictEqual(reversalLines.length, 4, 'Reversal entry must contain exactly 4 contra lines');
        origJournalLines.forEach((origLine, idx) => {
            const revLine = reversalLines[idx];
            assert_1.default.strictEqual(origLine.account_id, revLine.account_id, `Line ${idx + 1} account ID must match`);
            assert_1.default.strictEqual(origLine.debit, revLine.credit, `Line ${idx + 1} original debit (${origLine.debit}) must equal reversal credit (${revLine.credit})`);
            assert_1.default.strictEqual(origLine.credit, revLine.debit, `Line ${idx + 1} original credit (${origLine.credit}) must equal reversal debit (${revLine.debit})`);
        });
        console.log('  ✓ 4. Verified reversal journal lines exist and every debit/credit was exactly reversed.');
        // 5. Verify net accounting effect = zero
        const postVoidTb = reportService.getTrialBalance();
        const arPre = preTb.accounts.find(a => a.accountCode === '1200')?.balance || 0;
        const arPost = postVoidTb.accounts.find(a => a.accountCode === '1200')?.balance || 0;
        assert_1.default.strictEqual(arPre, arPost, 'Net Customer Receivable balance MUST return to pre-invoice state!');
        console.log('  ✓ 5. Verified net accounting effect is zero (Accounts Receivable returned to pre-invoice balance).');
        // 6. Verify second void attempt fails
        console.log('  6. Testing second void attempt on already voided invoice...');
        const secondVoidRes = await makeRequest(baseUrl, 'POST', `/api/invoices/${inv.id}/void`, {
            reason: 'Repeated void attempt'
        });
        assert_1.default.strictEqual(secondVoidRes.status, 400, 'Second void attempt must return HTTP 400 Bad Request');
        assert_1.default.ok(secondVoidRes.body.message.includes('already voided'), 'Error message must state invoice is already voided');
        console.log('  ✓ 6. Second void attempt failed safely with HTTP 400 Bad Request.');
    }
    finally {
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
