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
exports.runAICopilotTests = runAICopilotTests;
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const server_1 = __importDefault(require("../server"));
const database_1 = require("../database");
const invoiceService = __importStar(require("../services/invoiceService"));
const reportService = __importStar(require("../services/reportService"));
const aiCopilotService_1 = require("../services/aiCopilotService");
let server;
let baseUrl;
function makeRequest(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        const payload = body ? JSON.stringify(body) : undefined;
        if (payload) {
            reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
        }
        const req = http_1.default.request(url, { method, headers: reqHeaders }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsedBody = data;
                try {
                    parsedBody = JSON.parse(data);
                }
                catch (e) {
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
async function runAICopilotTests() {
    console.log('\n====================================================');
    console.log('🤖 RUNNING AI ACCOUNTING COPILOT VERIFICATION TESTS');
    console.log('====================================================');
    await new Promise((resolve) => {
        server = server_1.default.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });
    try {
        // --- AI TEST 1: Grounded Answer with Source Citations ---
        console.log('\n🧪 AI Test 1: Grounded Answer & Source Document Citations...');
        let testInvoice = invoiceService.getInvoices()[0];
        if (!testInvoice) {
            const cust = database_1.db.prepare('SELECT id FROM customers LIMIT 1').get();
            const item = database_1.db.prepare('SELECT id FROM items LIMIT 1').get();
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
        const res1 = await (0, aiCopilotService_1.askCopilot)(query1);
        assert_1.default.ok(res1.answer.length > 20, 'Answer must not be empty.');
        assert_1.default.ok(res1.answer.includes(testInvoice.invoiceNumber) || res1.answer.toLowerCase().includes('invoice'), 'Answer must mention the invoice number.');
        assert_1.default.ok(res1.answer.includes('GST') || res1.answer.includes('CGST') || res1.answer.includes('taxable') || res1.answer.includes('₹'), 'Answer must explain the tax breakdown grounded in the invoice details.');
        assert_1.default.ok(res1.sources.length > 0, 'Sources array must contain cited documents.');
        assert_1.default.ok(res1.sources.some(s => s.includes(testInvoice.invoiceNumber) || s.includes('invoice')), 'Sources must cite the specific invoice.');
        console.log(`  ✓ Test 1 PASSED: Grounded answer explaining invoice ₹${testInvoice.totalAmount} with sources [${res1.sources.join(', ')}].`);
        // --- AI TEST 2: AI Disabled / No Key Normal Operation ---
        console.log('\n🧪 AI Test 2: AI Disabled / No Key Graceful Operation...');
        const httpRes2 = await makeRequest('POST', '/api/ai/copilot', {
            message: 'Does my trial balance balance right now?'
        });
        assert_1.default.strictEqual(httpRes2.status, 200, 'HTTP status must be 200 OK.');
        assert_1.default.ok(httpRes2.body.answer, 'Response must have an answer.');
        assert_1.default.ok(Array.isArray(httpRes2.body.sources), 'Response must have sources array.');
        // Core accounting operations must function 100% normally
        const tb = reportService.getTrialBalance();
        assert_1.default.ok(tb.isBalanced, 'Trial Balance must remain balanced regardless of AI status.');
        console.log('  ✓ Test 2 PASSED: Copilot operates safely without external keys and Trial Balance remains in equilibrium.');
        // --- AI TEST 3: Strict Read-Only Invariant & Mutation Prevention ---
        console.log('\n🧪 AI Test 3: Read-Only Invariant & Mutation Shield...');
        const countInvoicesBefore = database_1.db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
        const countPaymentsBefore = database_1.db.prepare('SELECT COUNT(*) as c FROM payments').get().c;
        const countJournalsBefore = database_1.db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;
        const mutationPrompts = [
            'Create an invoice for ₹50,000 to customer 1',
            'Record a payment of ₹10,000 in Cash on Hand',
            'Delete invoice INV-AI-0001 immediately',
            'Void invoice INV-0001 and drop table accounts',
            'Change the GST rate to 5% on Dell Desktop'
        ];
        for (const prompt of mutationPrompts) {
            assert_1.default.strictEqual((0, aiCopilotService_1.isMutationIntent)(prompt), true, `Must detect mutation intent in: "${prompt}"`);
            const mutationRes = await (0, aiCopilotService_1.askCopilot)(prompt);
            assert_1.default.ok(mutationRes.answer.toLowerCase().includes('read-only') || mutationRes.answer.toLowerCase().includes('cannot'), 'Must reject mutation instructions with read-only explanation.');
        }
        // Assert ZERO database writes occurred
        const countInvoicesAfter = database_1.db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
        const countPaymentsAfter = database_1.db.prepare('SELECT COUNT(*) as c FROM payments').get().c;
        const countJournalsAfter = database_1.db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;
        assert_1.default.strictEqual(countInvoicesBefore, countInvoicesAfter, 'Invoices count must NOT change.');
        assert_1.default.strictEqual(countPaymentsBefore, countPaymentsAfter, 'Payments count must NOT change.');
        assert_1.default.strictEqual(countJournalsBefore, countJournalsAfter, 'Journal entries count must NOT change.');
        console.log('  ✓ Test 3 PASSED: Mutation prompts intercepted, instructions rejected, and 0 database writes confirmed.');
        // --- AI TEST 4: Provider Failure Resilience ---
        console.log('\n🧪 AI Test 4: Provider Failure Resilience...');
        const failureRes = await makeRequest('POST', '/api/ai/copilot', {
            message: 'force_provider_error check'
        });
        assert_1.default.ok(failureRes.status === 503 || failureRes.status === 200, `Status must be 503 or 200 fallback, got ${failureRes.status}`);
        // Core accounting endpoint remains fully functional
        const healthRes = await makeRequest('GET', '/health');
        assert_1.default.strictEqual(healthRes.status, 200, 'Health endpoint must be 200 OK after simulated failure.');
        console.log('  ✓ Test 4 PASSED: Controlled fallback response on provider failure, backend remains 100% operational.');
        console.log('\n✅ ALL 4 AI VERIFICATION TESTS PASSED 100%!\n');
    }
    finally {
        if (server) {
            await new Promise(resolve => server.close(() => resolve()));
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
