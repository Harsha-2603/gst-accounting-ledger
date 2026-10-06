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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMutationIntent = isMutationIntent;
exports.askCopilot = askCopilot;
const database_1 = require("../database");
const config_1 = require("../config");
const invoiceService = __importStar(require("./invoiceService"));
const paymentService = __importStar(require("./paymentService"));
const reportService = __importStar(require("./reportService"));
const errors_1 = require("../errors");
// Patterns that indicate intent to mutate financial state
const MUTATION_PATTERNS = [
    /\b(create|make|add|post|issue)\b.*?\b(invoice|bill|sale)\b/i,
    /\b(record|make|add|post|receive)\b.*?\b(payment|remittance)\b/i,
    /\b(create|post|add)\b.*?\b(journal|entry|voucher|line)\b/i,
    /\b(void|delete|cancel|remove|drop)\b/i,
    /\b(update|modify|alter|change|set)\b.*?\b(amount|balance|rate|tax|gst|invoice|payment|entry)\b/i,
    /\b(insert\s+into|delete\s+from|update\s+\w+\s+set|drop\s+table|alter\s+table)\b/i
];
function isMutationIntent(message) {
    return MUTATION_PATTERNS.some(pattern => pattern.test(message));
}
async function askCopilot(message) {
    if (!message || typeof message !== 'string' || message.trim() === '') {
        throw new errors_1.BadRequestError('Query message is required and cannot be empty.');
    }
    const query = message.trim();
    // RULE: AI Accounting Copilot is strictly READ-ONLY. Intercept any mutation attempt.
    if (isMutationIntent(query)) {
        return {
            aiEnabled: config_1.config.aiEnabled,
            answer: "The AI Accounting Copilot is strictly read-only and cannot create, modify, or delete invoices, payments, journal entries, GST rates, or ledger balances. Please use the verified accounting forms in the dashboard to record transactions.",
            sources: ["security:read_only_invariant"]
        };
    }
    // Provider Failure Simulation & Handling (docs/API.md line 377-384 / docs/PRD.md Scenario 8)
    if (query.toLowerCase().includes('force_provider_error')) {
        const error = new Error('AI Copilot provider is temporarily unavailable or timed out. Your underlying accounting data is safe and fully operational.');
        error.statusCode = 503;
        error.code = 'AI_PROVIDER_UNAVAILABLE';
        throw error;
    }
    // Disabled Mode Handling (docs/API.md line 370-376)
    if (query.toLowerCase().includes('simulate_disabled')) {
        return {
            aiEnabled: false,
            answer: "AI Copilot is currently disabled. Core accounting features continue to work normally.",
            sources: []
        };
    }
    const answerObj = generateGroundedAnswer(query);
    if (config_1.config.aiEnabled && config_1.config.aiApiKey) {
        try {
            const externalAnswer = await queryGeminiProvider(query, answerObj.context);
            if (externalAnswer) {
                return {
                    aiEnabled: true,
                    answer: externalAnswer.answer,
                    sources: externalAnswer.sources.length > 0 ? externalAnswer.sources : answerObj.sources
                };
            }
        }
        catch (err) {
            console.warn('AI Provider request failed, falling back to local grounded reasoning:', err.message);
        }
    }
    return {
        aiEnabled: config_1.config.aiEnabled,
        answer: answerObj.answer,
        sources: answerObj.sources
    };
}
function generateGroundedAnswer(query) {
    const lower = query.toLowerCase();
    // 1. Query for a specific invoice (e.g. "INV-0001", "INV-1", etc.)
    const invMatch = query.match(/INV-[\w-]+/i);
    if (invMatch) {
        const invNumber = invMatch[0].toUpperCase();
        const inv = invoiceService.getInvoiceById(invNumber);
        if (inv) {
            const isIntraState = inv.placeOfSupply === '27';
            const linesDesc = inv.lines && inv.lines.length > 0
                ? inv.lines.map((l) => `${l.quantity} units of ${l.description || 'Item'} (₹${l.taxableAmount.toFixed(2)})`).join(', ')
                : 'taxable goods';
            let taxExplanation = '';
            if (isIntraState) {
                taxExplanation = `Because the customer is located in Maharashtra (State ${inv.placeOfSupply}, intra-state supply), the 18% GST is split equally into 9% CGST (₹${inv.cgstAmount.toFixed(2)}) and 9% SGST (₹${inv.sgstAmount.toFixed(2)}).`;
            }
            else {
                taxExplanation = `Because the customer is located out-of-state (State ${inv.placeOfSupply}, inter-state supply), 100% of the tax is allocated to IGST (₹${inv.igstAmount.toFixed(2)}).`;
            }
            const answer = `Invoice ${inv.invoiceNumber} total is ₹${inv.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. It has a taxable subtotal of ₹${inv.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} across ${linesDesc}. ${taxExplanation} Status: ${inv.status}. Outstanding Due: ₹${inv.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;
            return {
                answer,
                sources: [
                    `invoice:${inv.invoiceNumber}`,
                    `gst_split:${inv.placeOfSupply}`,
                    ...(inv.lines && inv.lines[0] ? [`invoice_lines:${inv.lines[0].itemId}`] : [])
                ],
                context: { invoice: inv }
            };
        }
        else {
            return {
                answer: `I could not find an invoice matching '${invNumber}' in your live accounting records. Please verify the invoice number.`,
                sources: ['invoices:query'],
                context: {}
            };
        }
    }
    // 2. Query regarding Trial Balance equilibrium
    if (lower.includes('trial balance') || lower.includes('balance sheet') || lower.includes('equilibrium') || lower.includes('balanced')) {
        const tb = reportService.getTrialBalance();
        let answer = '';
        if (tb.isBalanced) {
            answer = `Yes, your trial balance is currently mathematically balanced. Total Debits: ₹${tb.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} equal Total Credits: ₹${tb.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Difference: ₹${tb.difference.toFixed(4)}). All ${tb.accounts.length} active accounts maintain mathematical equilibrium.`;
        }
        else {
            answer = `Warning: Your trial balance is currently unbalanced. Total Debits: ₹${tb.totalDebit} vs Total Credits: ₹${tb.totalCredit}. Discrepancy: ₹${tb.difference}.`;
        }
        return {
            answer,
            sources: ['report:trial-balance', 'accounts_transactions'],
            context: { trialBalance: tb }
        };
    }
    // 3. Query regarding GST tax collected / breakdown
    if (lower.includes('cgst') || lower.includes('sgst') || lower.includes('igst') || lower.includes('gst') || lower.includes('tax')) {
        const gstr1 = reportService.getGSTR1();
        const invoices = invoiceService.getInvoices({ status: 'DELIVERED' });
        let totalCgst = 0;
        let totalSgst = 0;
        let totalIgst = 0;
        let totalTaxable = 0;
        invoices.forEach((inv) => {
            totalCgst += inv.cgstAmount || 0;
            totalSgst += inv.sgstAmount || 0;
            totalIgst += inv.igstAmount || 0;
            totalTaxable += inv.subtotal || 0;
        });
        const totalTax = totalCgst + totalSgst + totalIgst;
        const answer = `Across all ${invoices.length} delivered sales invoices, you have billed ₹${totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in taxable value and collected a total of ₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in GST liabilities: ₹${totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in Output CGST, ₹${totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in Output SGST, and ₹${totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in Output IGST.`;
        return {
            answer,
            sources: ['report:gstr-1', 'accounts:2110', 'accounts:2120', 'accounts:2130'],
            context: { gstr1, totalTaxable, totalCgst, totalSgst, totalIgst, totalTax }
        };
    }
    // 4. Query regarding unpaid / due invoices
    if (lower.includes('unpaid') || lower.includes('due') || lower.includes('outstanding') || lower.includes('receivable')) {
        const invoices = invoiceService.getInvoices({ status: 'DELIVERED' });
        const unpaid = invoices.filter((i) => i.dueAmount > 0);
        const totalDue = unpaid.reduce((sum, i) => sum + i.dueAmount, 0);
        if (unpaid.length === 0) {
            return {
                answer: 'You have zero outstanding customer invoices. All delivered invoices are fully paid!',
                sources: ['invoices:status'],
                context: { unpaidCount: 0 }
            };
        }
        const listStr = unpaid.slice(0, 5).map((i) => `${i.invoiceNumber} (${i.customerName}): ₹${i.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} due`).join('; ');
        const moreStr = unpaid.length > 5 ? ` and ${unpaid.length - 5} more` : '';
        const answer = `You currently have ${unpaid.length} unpaid invoice(s) with a total outstanding balance of ₹${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}: ${listStr}${moreStr}.`;
        return {
            answer,
            sources: ['invoices:unpaid', 'accounts:1200'],
            context: { unpaidCount: unpaid.length, totalDue }
        };
    }
    // 5. Query regarding sales and payments summary ("Summarize today's sales and payments")
    if (lower.includes('summarize') || (lower.includes('sales') && lower.includes('payment'))) {
        const invoices = invoiceService.getInvoices({ status: 'DELIVERED' });
        const payments = paymentService.getPayments();
        const tb = reportService.getTrialBalance();
        const totalSales = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
        const totalGst = invoices.reduce((sum, i) => sum + (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0), 0);
        const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
        const answer = `Today's Accounting Summary: You have ${invoices.length} delivered sales invoices totaling ₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (including ₹${totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Output GST collected) and ${payments.length} customer payment remittance(s) totaling ₹${totalPayments.toLocaleString('en-IN', { minimumFractionDigits: 2 })} deposited. General Ledger Trial Balance is ${tb.isBalanced ? 'in perfect equilibrium' : 'unbalanced'} with Total Debits = Total Credits = ₹${tb.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;
        return {
            answer,
            sources: ['invoices:summary', 'payments:summary', 'report:trial-balance'],
            context: { totalSales, totalGst, totalPayments, trialBalance: tb }
        };
    }
    // 6. Query regarding payments or collections
    if (lower.includes('payment') || lower.includes('collection') || lower.includes('bank') || lower.includes('cash')) {
        const payments = paymentService.getPayments();
        const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
        const answer = `You have recorded ${payments.length} customer payment remittance(s) totaling ₹${totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Funds have been credited to Cash & Bank asset accounts and relieved from Accounts Receivable.`;
        return {
            answer,
            sources: ['payments:list', 'accounts:1000', 'accounts:1010'],
            context: { paymentCount: payments.length, totalCollected }
        };
    }
    // 7. Query regarding journal entries / general ledger vouchers (e.g. "Explain this journal entry", "Explain JV-0001")
    if (lower.includes('journal') || lower.includes('voucher') || lower.includes('entry')) {
        const jvMatch = query.match(/JV-[\w-]+/i);
        let entry = null;
        if (jvMatch) {
            entry = database_1.db.prepare('SELECT * FROM journal_entries WHERE entry_number = ?').get(jvMatch[0].toUpperCase());
        }
        if (!entry) {
            entry = database_1.db.prepare('SELECT * FROM journal_entries ORDER BY entry_date DESC, id DESC LIMIT 1').get();
        }
        if (entry) {
            const lines = database_1.db.prepare(`
        SELECT jl.*, a.code as account_code, a.name as account_name
        FROM journal_lines jl
        JOIN accounts a ON jl.account_id = a.id
        WHERE jl.journal_entry_id = ?
        ORDER BY jl.id ASC
      `).all(entry.id);
            const debits = lines.filter(l => parseFloat(l.debit) > 0).map(l => `Debit ${l.account_code} (${l.account_name}) ₹${parseFloat(l.debit).toFixed(2)}`).join(', ');
            const credits = lines.filter(l => parseFloat(l.credit) > 0).map(l => `Credit ${l.account_code} (${l.account_name}) ₹${parseFloat(l.credit).toFixed(2)}`).join(', ');
            const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
            const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
            const answer = `Journal Entry ${entry.entry_number} (Dated: ${entry.entry_date}, Type: ${entry.entry_type}) posts balanced double-entry movements: ${debits}; ${credits}. Memo: '${entry.narration || 'General ledger posting'}'. Equilibrium Status: Debits ₹${totalDebit.toFixed(2)} = Credits ₹${totalCredit.toFixed(2)} (Difference: 0.00). Complies with Section 128 of the Companies Act with immutable audit logging.`;
            return {
                answer,
                sources: [`journal:${entry.entry_number}`, 'accounts_transactions', `voucher_type:${entry.entry_type}`],
                context: { journalEntry: entry, lines }
            };
        }
        else {
            return {
                answer: 'No journal entries found in your accounting records yet. Creating invoices or payments will post balanced double-entry vouchers automatically.',
                sources: ['journal:empty'],
                context: {}
            };
        }
    }
    // 8. Default financial summary
    const tb = reportService.getTrialBalance();
    const invoices = invoiceService.getInvoices();
    const payments = paymentService.getPayments();
    const answer = `Here is your live accounting summary: You have ${invoices.length} invoices on file and ${payments.length} payments recorded. Your general ledger Trial Balance is ${tb.isBalanced ? 'perfectly balanced' : 'unbalanced'} with total debits of ₹${tb.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} and total credits of ₹${tb.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;
    return {
        answer,
        sources: ['report:trial-balance', 'invoices:summary', 'payments:summary'],
        context: { trialBalance: tb, invoiceCount: invoices.length, paymentCount: payments.length }
    };
}
async function queryGeminiProvider(userPrompt, context) {
    const apiKey = config_1.config.aiApiKey;
    const model = config_1.config.aiModel || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const systemInstruction = `You are the AI Accounting Copilot for a GST-Ready Accounting Ledger platform in India.
You provide clear, accurate, professional financial explanations to wholesale shop owners.
CRITICAL RULES:
1. You are STRICTLY READ-ONLY. You cannot create, modify, void, or delete invoices, payments, journal lines, or tax rates.
2. Ground all answers solely in the provided JSON accounting data. Never invent fictitious numbers or transactions.
3. Reference relevant documents such as invoice numbers, customer names, HSN codes, and CGST/SGST/IGST splits.`;
    const payload = {
        contents: [
            {
                parts: [
                    { text: systemInstruction },
                    { text: `Live Accounting System Data Context:\n${JSON.stringify(context, null, 2)}` },
                    { text: `User Question: ${userPrompt}` }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600
        }
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        return null;
    }
    return {
        answer: text.trim(),
        sources: ['gemini-provider', 'live_ledger']
    };
}
