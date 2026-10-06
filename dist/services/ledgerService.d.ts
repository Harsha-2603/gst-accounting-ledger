import { JournalLineInput } from '../domain/invariantGuard';
export interface PostJournalInput {
    entryDate?: string;
    entryType?: string;
    referenceType?: string;
    referenceId?: string;
    narration?: string;
    lines: JournalLineInput[];
}
export interface JournalEntryDTO {
    id: string;
    entryNumber: string;
    entryDate: string;
    entryType: string;
    referenceType?: string;
    referenceId?: string;
    linesCount: number;
}
/**
 * Posts a double-entry journal transaction to the database.
 * MUST run validateJournalBalance before ANY writes to database.
 * Runs atomically inside caller DB transaction or creates new transaction.
 */
export declare function postJournalEntry(entryData: PostJournalInput): JournalEntryDTO;
export declare function getTransactions(filters?: {
    referenceId?: string;
    accountId?: string;
}): any[];
