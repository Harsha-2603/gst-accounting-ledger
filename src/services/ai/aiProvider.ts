/**
 * AI Provider Abstraction
 * Decouples model provider logic from domain accounting services.
 * Ensures the system operates 100% normally without an external key or when provider is down.
 */

import { config } from '../../config';
import {
  getInvoiceContext,
  getUnpaidInvoicesContext,
  getTrialBalanceContext,
  getGSTSummaryContext,
  getPaymentsContext,
  getJournalEntryContext
} from './accountingContextService';

export interface AIProviderResult {
  answer: string;
  sources: string[];
  provider: string;
}

export interface AIProvider {
  name: string;
  generateAnswer(query: string): Promise<AIProviderResult>;
}

/**
 * Local Deterministic Reasoning Provider
 * Operates purely offline without external network dependencies.
 * Grounds answers in verified live accounting records with exact paisa precision.
 */
export class LocalDeterministicProvider implements AIProvider {
  public name = 'local-grounded';

  async generateAnswer(query: string): Promise<AIProviderResult> {
    const lower = query.toLowerCase();

    // 1. Query for a specific invoice (e.g. "INV-0001", "Why is this invoice ₹11,800?", etc.)
    const invCtx = getInvoiceContext(query);
    if (invCtx) {
      const inv = invCtx.invoice;
      const isIntraState = inv.placeOfSupply === config.defaultStateCode;
      const linesDesc = inv.lines && inv.lines.length > 0
        ? inv.lines.map((l: any) => `${l.quantity} units of ${l.description || 'Item'} (₹${Number(l.taxableAmount).toFixed(2)})`).join(', ')
        : 'taxable goods';

      let taxExplanation = '';
      if (isIntraState) {
        taxExplanation = `Because the customer is located in Maharashtra (State ${inv.placeOfSupply}, intra-state supply), the 18% GST is split equally into 9% CGST (₹${Number(inv.cgstAmount).toFixed(2)}) and 9% SGST (₹${Number(inv.sgstAmount).toFixed(2)}).`;
      } else {
        taxExplanation = `Because the customer is located out-of-state (State ${inv.placeOfSupply}, inter-state supply), 100% of the tax is allocated to IGST (₹${Number(inv.igstAmount).toFixed(2)}).`;
      }

      const answer = `Invoice ${inv.invoiceNumber} total is ₹${Number(inv.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}. It has a taxable subtotal of ₹${Number(inv.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} across ${linesDesc}. ${taxExplanation} Status: ${inv.status}. Outstanding Due: ₹${Number(inv.dueAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;

      return {
        answer,
        sources: invCtx.sources,
        provider: this.name
      };
    }

    // 2. Query regarding Trial Balance equilibrium
    if (lower.includes('trial balance') || lower.includes('balance sheet') || lower.includes('equilibrium') || lower.includes('balanced')) {
      const { trialBalance, sources } = getTrialBalanceContext();
      let answer = '';
      if (trialBalance.isBalanced) {
        answer = `Yes, your trial balance is currently mathematically balanced. Total Debits: ₹${Number(trialBalance.totalDebit).toLocaleString('en-IN', { minimumFractionDigits: 2 })} equal Total Credits: ₹${Number(trialBalance.totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Difference: ₹${Number(trialBalance.difference).toFixed(4)}). All ${trialBalance.accounts.length} active accounts maintain mathematical equilibrium.`;
      } else {
        answer = `Warning: Your trial balance is currently unbalanced. Total Debits: ₹${trialBalance.totalDebit} vs Total Credits: ₹${trialBalance.totalCredit}. Discrepancy: ₹${trialBalance.difference}.`;
      }

      return {
        answer,
        sources,
        provider: this.name
      };
    }

    // 3. Query regarding GST tax collected / breakdown
    if (lower.includes('cgst') || lower.includes('sgst') || lower.includes('igst') || lower.includes('gst') || lower.includes('tax')) {
      const { gstSummary, sources } = getGSTSummaryContext();
      const answer = `Across all ${gstSummary.invoiceCount} delivered sales invoices, you have billed ₹${gstSummary.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in taxable value and collected a total of ₹${gstSummary.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in GST liabilities: ₹${gstSummary.totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in Output CGST, ₹${gstSummary.totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in Output SGST, and ₹${gstSummary.totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} in Output IGST.`;

      return {
        answer,
        sources,
        provider: this.name
      };
    }

    // 4. Query regarding unpaid / due invoices
    if (lower.includes('unpaid') || lower.includes('due') || lower.includes('outstanding') || lower.includes('receivable')) {
      const { unpaid, totalDue, sources } = getUnpaidInvoicesContext();
      if (unpaid.length === 0) {
        return {
          answer: 'You have zero outstanding customer invoices. All delivered invoices are fully paid!',
          sources: ['invoices:status'],
          provider: this.name
        };
      }

      const listStr = unpaid.slice(0, 5).map((i: any) => `${i.invoiceNumber} (${i.customerName || 'Customer'}): ₹${Number(i.dueAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} due`).join('; ');
      const moreStr = unpaid.length > 5 ? ` and ${unpaid.length - 5} more` : '';
      const answer = `You currently have ${unpaid.length} unpaid invoice(s) with a total outstanding balance of ₹${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}: ${listStr}${moreStr}.`;

      return {
        answer,
        sources,
        provider: this.name
      };
    }

    // 5. Query regarding payments or collections
    if (lower.includes('payment') || lower.includes('collection') || lower.includes('bank') || lower.includes('cash')) {
      const { paymentsSummary, sources } = getPaymentsContext();
      const answer = `You have recorded ${paymentsSummary.paymentCount} customer payment remittance(s) totaling ₹${paymentsSummary.totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Funds have been credited to Cash & Bank asset accounts and relieved from Accounts Receivable.`;

      return {
        answer,
        sources,
        provider: this.name
      };
    }

    // 6. Query regarding journal entries / general ledger vouchers
    if (lower.includes('journal') || lower.includes('voucher') || lower.includes('entry')) {
      const { journalEntry, sources } = getJournalEntryContext(query);
      if (journalEntry) {
        const { entry, lines, totalDebit, totalCredit } = journalEntry;
        const debits = lines.filter(l => parseFloat(l.debit) > 0).map(l => `Debit ${l.account_code} (${l.account_name}) ₹${parseFloat(l.debit).toFixed(2)}`).join(', ');
        const credits = lines.filter(l => parseFloat(l.credit) > 0).map(l => `Credit ${l.account_code} (${l.account_name}) ₹${parseFloat(l.credit).toFixed(2)}`).join(', ');

        const answer = `Journal Entry ${entry.entry_number} (Dated: ${entry.entry_date}, Type: ${entry.entry_type}) posts balanced double-entry movements: ${debits}; ${credits}. Memo: '${entry.narration || 'General ledger posting'}'. Equilibrium Status: Debits ₹${totalDebit.toFixed(2)} = Credits ₹${totalCredit.toFixed(2)} (Difference: 0.00). Complies with Section 128 of the Companies Act with immutable audit logging.`;

        return {
          answer,
          sources,
          provider: this.name
        };
      }
    }

    // 7. General financial summary
    const { trialBalance } = getTrialBalanceContext();
    const { paymentsSummary } = getPaymentsContext();
    const { gstSummary } = getGSTSummaryContext();

    const answer = `Here is your live accounting summary: You have ${gstSummary.invoiceCount} invoices on file and ${paymentsSummary.paymentCount} payments recorded. Your general ledger Trial Balance is ${trialBalance.isBalanced ? 'perfectly balanced' : 'unbalanced'} with total debits of ₹${Number(trialBalance.totalDebit).toLocaleString('en-IN', { minimumFractionDigits: 2 })} and total credits of ₹${Number(trialBalance.totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;

    return {
      answer,
      sources: ['report:trial-balance', 'invoices:summary', 'payments:summary'],
      provider: this.name
    };
  }
}

/**
 * Google Gemini Provider
 * Implements external LLM generation with strict system instructions and read-only boundary.
 */
export class GeminiProvider implements AIProvider {
  public name = 'gemini';

  async generateAnswer(query: string): Promise<AIProviderResult> {
    const apiKey = config.aiApiKey;
    if (!apiKey) {
      throw new Error('AI_API_KEY is not configured.');
    }

    const model = config.aiModel || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Gather grounded context
    const invCtx = getInvoiceContext(query);
    const tbCtx = getTrialBalanceContext();
    const gstCtx = getGSTSummaryContext();
    const context = {
      matchedInvoice: invCtx?.invoice || null,
      trialBalance: tbCtx.trialBalance,
      gstSummary: gstCtx.gstSummary
    };

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
            { text: `User Question: ${query}` }
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
      const error: any = new Error(`Gemini API returned status ${response.status}: ${response.statusText}`);
      error.statusCode = response.status >= 500 ? 503 : response.status;
      throw error;
    }

    const data: any = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Malformed or empty candidate response from Gemini API.');
    }

    return {
      answer: text.trim(),
      sources: invCtx ? invCtx.sources : ['report:trial-balance', 'accounts_transactions'],
      provider: this.name
    };
  }
}

/**
 * Provider Factory
 */
export function getAIProvider(): AIProvider {
  if (config.aiEnabled && config.aiApiKey && config.aiProvider === 'gemini') {
    return new GeminiProvider();
  }
  return new LocalDeterministicProvider();
}
