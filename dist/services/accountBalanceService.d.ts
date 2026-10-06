export interface AccountBalanceInfo {
    accountId: string;
    accountCode: string;
    accountName: string;
    normalBalance: string;
    balance: number;
}
/**
 * Account Balance Service
 * Dedicated service for managing and recalculating general ledger account balances.
 */
export declare function getAccountBalance(accountId: string): number;
export declare function updateAccountBalance(accountId: string, debit: any, credit: any): string;
export declare function recalculateAllAccountBalances(): void;
