export interface JournalLineInput {
    accountId: string;
    debit: number | string;
    credit: number | string;
    description?: string;
    lineOrder?: number;
}
export interface ValidationResult {
    isBalanced: boolean;
    totalDebit: string;
    totalCredit: string;
    difference: string;
}
/**
 * Zero-Trust Transaction Balancing Guard (Fix 1 & Killer Test 1)
 * Asserts Sum(Debit) == Sum(Credit) pre-commit invariant.
 * Throws UnbalancedTransactionError if |Sum(Debit) - Sum(Credit)| >= 0.0001
 * Also asserts that no single journal line contains both debit and credit amounts.
 */
export declare function validateJournalBalance(journalLines: JournalLineInput[]): ValidationResult;
