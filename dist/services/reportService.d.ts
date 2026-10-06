export interface TrialBalanceAccountDTO {
    accountId: string;
    accountCode: string;
    accountName: string;
    type: string;
    normalBalance: string;
    debit: number;
    credit: number;
    balance: number;
}
export interface TrialBalanceResult {
    asOfDate: string;
    isBalanced: boolean;
    totalDebit: number;
    totalCredit: number;
    difference: number;
    accounts: TrialBalanceAccountDTO[];
}
export declare function getTrialBalance(toDate?: string): TrialBalanceResult;
export declare function getGSTR1(fromDate?: string, toDate?: string): any;
