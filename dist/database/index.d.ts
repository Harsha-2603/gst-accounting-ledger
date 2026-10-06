import { Database as DatabaseType } from 'better-sqlite3';
export declare const db: DatabaseType;
export declare function initDatabase(): void;
export declare function resetLedger(): void;
