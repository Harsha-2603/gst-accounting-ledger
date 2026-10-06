"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runApiEndpointIntegrationTests = runApiEndpointIntegrationTests;
const assert_1 = __importDefault(require("assert"));
const http_1 = __importDefault(require("http"));
const server_1 = __importDefault(require("../server"));
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
async function runApiEndpointIntegrationTests() {
    console.log('🧪 Running Core API Endpoint Integration Test Suite...\n');
    // Start temporary test server
    await new Promise((resolve) => {
        server = server_1.default.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });
    try {
        // 1. GET /health
        console.log('  Testing GET /health...');
        const resHealth = await makeRequest('GET', '/health');
        assert_1.default.strictEqual(resHealth.status, 200);
        assert_1.default.strictEqual(resHealth.body.status, 'OK');
        assert_1.default.strictEqual(resHealth.body.database, 'CONNECTED');
        console.log('  ✓ GET /health PASSED.');
        // 2. GET /api/accounts & POST /api/accounts
        console.log('  Testing COA Endpoints (GET & POST /api/accounts)...');
        const resAccList = await makeRequest('GET', '/api/accounts');
        assert_1.default.strictEqual(resAccList.status, 200);
        assert_1.default.ok(Array.isArray(resAccList.body));
        const newAccCode = `103${Date.now().toString().slice(-3)}`;
        const resAccCreate = await makeRequest('POST', '/api/accounts', {
            code: newAccCode,
            name: 'Special Reserve Account',
            type: 'ASSET',
            normalBalance: 'DEBIT'
        });
        assert_1.default.strictEqual(resAccCreate.status, 201);
        assert_1.default.strictEqual(resAccCreate.body.code, newAccCode);
        console.log('  ✓ COA Endpoints PASSED.');
        // 3. POST /api/invoices (Intra-State 18% GST Flow)
        console.log('  Testing POST /api/invoices (Intra-State GST Dual-Split Flow)...');
        const invNumIntra = `INV-API-${Date.now().toString().slice(-4)}`;
        const resInvIntra = await makeRequest('POST', '/api/invoices', {
            customerId: 'cust_intra_27',
            invoiceDate: '2026-10-06',
            dueDate: '2026-11-06',
            invoiceNumber: invNumIntra,
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
        assert_1.default.strictEqual(resInvIntra.status, 201);
        assert_1.default.strictEqual(resInvIntra.body.invoiceNumber, invNumIntra);
        assert_1.default.strictEqual(resInvIntra.body.subtotal, 100000.00);
        assert_1.default.strictEqual(resInvIntra.body.cgstAmount, 9000.00);
        assert_1.default.strictEqual(resInvIntra.body.sgstAmount, 9000.00);
        assert_1.default.strictEqual(resInvIntra.body.igstAmount, 0.00);
        assert_1.default.strictEqual(resInvIntra.body.totalAmount, 118000.00);
        assert_1.default.strictEqual(resInvIntra.body.dueAmount, 118000.00);
        assert_1.default.ok(resInvIntra.body.journalEntryId);
        console.log('  ✓ POST /api/invoices (Intra-State) PASSED: Subtotal ₹100,000 + CGST ₹9,000 + SGST ₹9,000 = Total ₹118,000.');
        // 4. POST /api/invoices (Inter-State 18% IGST Flow)
        console.log('  Testing POST /api/invoices (Inter-State IGST Flow)...');
        const invNumInter = `INV-API-INTER-${Date.now().toString().slice(-4)}`;
        const resInvInter = await makeRequest('POST', '/api/invoices', {
            customerId: 'cust_inter_24',
            invoiceDate: '2026-10-06',
            dueDate: '2026-11-06',
            invoiceNumber: invNumInter,
            deliver: true,
            lines: [
                {
                    itemId: 'item_pc_8471',
                    description: 'Dell Desktop for Gujarat Office',
                    hsnCode: '8471',
                    quantity: 1,
                    unitPrice: 100000.00,
                    taxRate: 18.00
                }
            ]
        });
        assert_1.default.strictEqual(resInvInter.status, 201);
        assert_1.default.strictEqual(resInvInter.body.subtotal, 100000.00);
        assert_1.default.strictEqual(resInvInter.body.cgstAmount, 0.00);
        assert_1.default.strictEqual(resInvInter.body.sgstAmount, 0.00);
        assert_1.default.strictEqual(resInvInter.body.igstAmount, 18000.00);
        assert_1.default.strictEqual(resInvInter.body.totalAmount, 118000.00);
        console.log('  ✓ POST /api/invoices (Inter-State) PASSED: Subtotal ₹100,000 + IGST ₹18,000 = Total ₹118,000.');
        // 5. POST /api/payments (Customer Remittance & AR Relief Flow)
        console.log('  Testing POST /api/payments (Customer Remittance & AR Relief Flow)...');
        const resPayment = await makeRequest('POST', '/api/payments', {
            customerId: 'cust_intra_27',
            paymentDate: '2026-10-06',
            amount: 118000.00,
            depositAccountId: 'acc_bank_1010',
            referenceNumber: 'NEFT-API-849102',
            allocations: [
                {
                    invoiceId: resInvIntra.body.id,
                    amount: 118000.00
                }
            ]
        });
        assert_1.default.strictEqual(resPayment.status, 201);
        assert_1.default.strictEqual(resPayment.body.amount, 118000.00);
        assert_1.default.strictEqual(resPayment.body.settledInvoices[0].dueAmount, 0.00);
        assert_1.default.strictEqual(resPayment.body.settledInvoices[0].isFullyPaid, true);
        console.log('  ✓ POST /api/payments PASSED: Customer payment ₹118,000 recorded, AR relieved, invoice fully settled.');
        // 6. POST /api/invoices/:id/void (Void Delivered Unpaid Invoice Flow)
        console.log('  Testing POST /api/invoices/:id/void (Immutable Reversal Flow)...');
        // Create new unpaid delivered invoice for voiding
        const invNumVoid = `INV-API-VOID-${Date.now().toString().slice(-4)}`;
        const resInvVoid = await makeRequest('POST', '/api/invoices', {
            customerId: 'cust_intra_27',
            invoiceDate: '2026-10-06',
            dueDate: '2026-11-06',
            invoiceNumber: invNumVoid,
            deliver: true,
            lines: [
                { itemId: 'item_paper_4802', description: 'Paper Bundles', hsnCode: '4802', quantity: 10, unitPrice: 500.00, taxRate: 12.00 }
            ]
        });
        const resVoidAction = await makeRequest('POST', `/api/invoices/${resInvVoid.body.id}/void`, {
            reason: 'Customer billing cancellation test'
        });
        assert_1.default.strictEqual(resVoidAction.status, 200);
        assert_1.default.strictEqual(resVoidAction.body.status, 'VOIDED');
        assert_1.default.strictEqual(resVoidAction.body.dueAmount, 0.00);
        assert_1.default.ok(resVoidAction.body.reversalJournalEntryId);
        // Repeated void attempt must fail safely with HTTP 400
        const resRepeatVoid = await makeRequest('POST', `/api/invoices/${resInvVoid.body.id}/void`, {
            reason: 'Second void attempt'
        });
        assert_1.default.strictEqual(resRepeatVoid.status, 400);
        assert_1.default.ok(resRepeatVoid.body.message.includes('already voided'));
        console.log('  ✓ POST /api/invoices/:id/void PASSED: Immutable reversal contra-entries posted; repeated void failed safely with HTTP 400.');
        // 7. Idempotency-Key Header Handling Test
        console.log('  Testing Idempotency-Key header request deduplication...');
        const idemKey = `idem_key_${Date.now()}`;
        const invNumIdem = `INV-IDEM-${Date.now().toString().slice(-4)}`;
        const resIdemFirst = await makeRequest('POST', '/api/invoices', {
            customerId: 'cust_intra_27',
            invoiceDate: '2026-10-06',
            invoiceNumber: invNumIdem,
            deliver: true,
            lines: [{ itemId: 'item_pc_8471', description: 'Idempotency Test PC', hsnCode: '8471', quantity: 1, unitPrice: 10000.00, taxRate: 18.00 }]
        }, { 'Idempotency-Key': idemKey });
        assert_1.default.strictEqual(resIdemFirst.status, 201);
        // Re-send EXACT same request with same Idempotency-Key header
        const resIdemSecond = await makeRequest('POST', '/api/invoices', {
            customerId: 'cust_intra_27',
            invoiceDate: '2026-10-06',
            invoiceNumber: invNumIdem,
            deliver: true,
            lines: [{ itemId: 'item_pc_8471', description: 'Idempotency Test PC', hsnCode: '8471', quantity: 1, unitPrice: 10000.00, taxRate: 18.00 }]
        }, { 'Idempotency-Key': idemKey });
        assert_1.default.strictEqual(resIdemSecond.status, 201);
        assert_1.default.strictEqual(resIdemSecond.headers['x-cache-hit'], 'Idempotency-Guard');
        assert_1.default.strictEqual(resIdemSecond.body.id, resIdemFirst.body.id);
        console.log('  ✓ Idempotency-Key header test PASSED: Cached response returned with X-Cache-Hit header.');
        // 8. GET /api/reports/trial-balance & GET /api/transactions
        console.log('  Testing Reporting & Transaction Query Endpoints...');
        const resTb = await makeRequest('GET', '/api/reports/trial-balance');
        assert_1.default.strictEqual(resTb.status, 200);
        assert_1.default.strictEqual(resTb.body.isBalanced, true);
        assert_1.default.strictEqual(resTb.body.difference, 0.00);
        const resTxns = await makeRequest('GET', '/api/transactions');
        assert_1.default.strictEqual(resTxns.status, 200);
        assert_1.default.ok(Array.isArray(resTxns.body.transactions));
        console.log('  ✓ GET /api/reports/trial-balance and GET /api/transactions PASSED.');
    }
    finally {
        server.close();
    }
    console.log('\n✅ ALL API ENDPOINT INTEGRATION TESTS PASSED 100%!');
}
if (require.main === module) {
    runApiEndpointIntegrationTests().catch(err => {
        console.error('❌ API Endpoint Integration Tests FAILED:', err);
        process.exit(1);
    });
}
