/**
 * Mutation Shield for AI Accounting Copilot
 * Enforces the strict READ-ONLY boundary specified in docs/ARCHITECTURE.md and docs/PRD.md.
 * Defends against prompt instructions attempting to mutate financial state.
 */

const MUTATION_PATTERNS: RegExp[] = [
  // Invoices: create, issue, post, make, delete, void, cancel
  /\b(create|make|add|post|issue|generate)\b.*?\b(invoice|bill|sale)\b/i,
  /\b(void|delete|cancel|remove|drop|scrap)\b.*?\b(invoice|bill|sale)\b/i,
  
  // Payments: record, receive, post, delete, refund, allocate
  /\b(record|make|add|post|receive|accept)\b.*?\b(payment|remittance|money|cash)\b/i,
  /\b(delete|cancel|reverse|refund)\b.*?\b(payment|remittance)\b/i,

  // Journal entries: post, create, add, reverse, delete vouchers
  /\b(create|post|add|record|write)\b.*?\b(journal|entry|voucher|line)\b/i,
  /\b(delete|remove|void|drop)\b.*?\b(journal|entry|voucher|line)\b/i,

  // GST & Tax rates: modify, change, alter, update GST
  /\b(update|modify|alter|change|set|override)\b.*?\b(rate|tax|gst|cgst|sgst|igst|hsn)\b/i,

  // Account balances & Chart of Accounts
  /\b(update|modify|alter|change|set|reset|zero|adjust)\b.*?\b(balance|account|amount)\b/i,

  // Arbitrary SQL injection & database commands
  /\b(insert\s+into|delete\s+from|update\s+\w+\s+set|drop\s+table|alter\s+table|truncate\s+table)\b/i,
  /\b(sqlite_master|exec\(|execute\()\b/i
];

export interface MutationShieldResult {
  isMutation: boolean;
  reason?: string;
  rejectionMessage?: string;
}

/**
 * Checks whether user query contains intent to create, modify, delete, or alter accounting records.
 */
export function checkMutationIntent(query: string): MutationShieldResult {
  if (!query || typeof query !== 'string') {
    return { isMutation: false };
  }

  const trimmed = query.trim();
  for (const pattern of MUTATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMutation: true,
        reason: 'Mutation instruction detected matching accounting protection pattern.',
        rejectionMessage: 'The AI Accounting Copilot is strictly read-only and cannot create, modify, or delete invoices, payments, journal entries, GST rates, or ledger balances. Please use the verified accounting forms in the dashboard to record transactions.'
      };
    }
  }

  return { isMutation: false };
}

export function isMutationIntent(query: string): boolean {
  return checkMutationIntent(query).isMutation;
}
