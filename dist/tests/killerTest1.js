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
exports.runKillerTest1 = runKillerTest1;
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const server_1 = __importDefault(require("../server"));
const invariantGuard_1 = require("../domain/invariantGuard");
const ledgerService = __importStar(require("../services/ledgerService"));
const database_1 = require("../database");
const errors_1 = require("../errors");
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
async function runKillerTest1() {
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
    const initialEntriesCount = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get().cnt;
    const initialLinesCount = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get().cnt;
    const initialAccountsSnapshot = database_1.db.prepare('SELECT id, code, name, balance FROM accounts').all();
    // 1. Pre-Commit Domain Guard Assertion
    let domainErrorCaught = false;
    try {
        (0, invariantGuard_1.validateJournalBalance)(unbalancedLines);
    }
    catch (err) {
        domainErrorCaught = true;
        assert_1.default.strictEqual(err instanceof errors_1.UnbalancedTransactionError, true, 'Must throw UnbalancedTransactionError instance');
        assert_1.default.strictEqual(err.statusCode, 422, 'Must specify HTTP 422 status code');
        assert_1.default.strictEqual(err.errorCode, 'UNPROCESSABLE_ENTITY');
        assert_1.default.strictEqual(err.difference, '180.0000', 'Must calculate exact discrepancy difference');
    }
    assert_1.default.strictEqual(domainErrorCaught, true, 'Zero-Trust Guard MUST catch and reject unbalanced lines before DB persistence.');
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
    }
    catch (err) {
        serviceErrorCaught = true;
        assert_1.default.strictEqual(err.statusCode, 422, 'Service boundary must return HTTP 422 error status.');
    }
    assert_1.default.strictEqual(serviceErrorCaught, true, 'Ledger Service must abort write on unbalanced payload.');
    console.log('  ✓ 2. Ledger Transaction Service aborted write with HTTP 422 UNPROCESSABLE_ENTITY.');
    // 3. HTTP API Boundary Assertion (POST /api/transactions)
    const server = server_1.default.listen(0, '127.0.0.1');
    await new Promise((res) => server.once('listening', res));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    try {
        const apiRes = await makeRequest(baseUrl, 'POST', '/api/transactions', {
            entryDate: '2026-10-06',
            entryType: 'MANUAL',
            narration: 'HTTP Unbalanced Test',
            lines: unbalancedLines
        });
        assert_1.default.strictEqual(apiRes.status, 422, 'HTTP API must respond with HTTP 422 Status Code');
        assert_1.default.strictEqual(apiRes.body.error, 'UNPROCESSABLE_ENTITY');
        console.log('  ✓ 3. HTTP API Endpoint (POST /api/transactions) rejected request with HTTP 422 UNPROCESSABLE_ENTITY.');
    }
    finally {
        server.close();
    }
    // 4. Database Rows & Account Mutation Invariant Verification
    const finalEntriesCount = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get().cnt;
    const finalLinesCount = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_lines').get().cnt;
    const finalAccountsSnapshot = database_1.db.prepare('SELECT id, code, name, balance FROM accounts').all();
    assert_1.default.strictEqual(initialEntriesCount, finalEntriesCount, 'ZERO rows must be written to journal_entries table!');
    assert_1.default.strictEqual(initialLinesCount, finalLinesCount, 'ZERO rows must be written to journal_lines table!');
    console.log('  ✓ 4. Verified ZERO rows written to journal_entries and journal_lines tables.');
    // Verify NO account balance mutation
    initialAccountsSnapshot.forEach(initAcc => {
        const finalAcc = finalAccountsSnapshot.find(a => a.id === initAcc.id);
        assert_1.default.ok(finalAcc, `Account ${initAcc.code} must exist in final snapshot`);
        assert_1.default.strictEqual(initAcc.balance, finalAcc.balance, `Account ${initAcc.code} (${initAcc.name}) balance MUST NOT mutate! (Before: ${initAcc.balance}, After: ${finalAcc.balance})`);
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
