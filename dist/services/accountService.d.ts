export interface AccountDTO {
    id: string;
    code: string;
    name: string;
    type: string;
    normalBalance: string;
    balance: number;
    isActive: boolean;
    createdAt: string;
}
export declare function getAccounts(): AccountDTO[];
export declare function getAccountById(id: string): AccountDTO | null;
export declare function createAccount(data: {
    code: string;
    name: string;
    type: string;
    normalBalance: string;
}): AccountDTO;
