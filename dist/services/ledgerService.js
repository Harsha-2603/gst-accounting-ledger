"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postJournalEntry = postJournalEntry;
exports.getTransactions = getTransactions;
const database_1 = require("../database");
const crypto_1 = __importDefault(require("crypto"));
const decimal_1 = require("../domain/decimal");
const invariantGuard_1 = require("../domain/invariantGuard");
const accountBalanceService_1 = require("./accountBalanceService");
/**
 * Posts a double-entry journal transaction to the database.
 * MUST run validateJournalBalance before ANY writes to database.
 * Runs atomically inside caller DB transaction or creates new transaction.
 */
function postJournalEntry(entryData) {
    const { entryDate, entryType, referenceType, referenceId, narration, lines } = entryData;
    // 1. Zero-Trust Balancing Assertion (Killer Test 1)
    (0, invariantGuard_1.validateJournalBalance)(lines);
    const executePost = () => {
        const entryId = 'jv_' + crypto_1.default.randomUUID().slice(0, 8);
        const count = database_1.db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get().cnt;
        const entryNumber = `JV-${String(count + 1).padStart(4, '0')}`;
        const now = new Date().toISOString();
        // Insert journal_entries header
        database_1.db.prepare(`
      INSERT INTO journal_entries (id, entry_number, entry_date, entry_type, reference_type, reference_id, narration, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entryId, entryNumber, entryDate || now.slice(0, 10), entryType || 'MANUAL', referenceType || null, referenceId || null, narration || '', now);
        // Insert journal_lines and update account balances
        const insertLine = database_1.db.prepare(`
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, line_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        lines.forEach((line, idx) => {
            const lineId = 'jl_' + crypto_1.default.randomUUID().slice(0, 8);
            const debitStr = (0, decimal_1.fmtDec)(line.debit || 0);
            const creditStr = (0, decimal_1.fmtDec)(line.credit || 0);
            insertLine.run(lineId, entryId, line.accountId, debitStr, creditStr, line.description || '', idx + 1);
            // Account balance update using Account Balance Service
            (0, accountBalanceService_1.updateAccountBalance)(line.accountId, debitStr, creditStr);
        });
        return {
            id: entryId,
            entryNumber,
            entryDate: entryDate || now.slice(0, 10),
            entryType: entryType || 'MANUAL',
            referenceType,
            referenceId,
            linesCount: lines.length
        };
    };
    const txn = database_1.db.transaction(executePost);
    return txn();
}
function getTransactions(filters = {}) {
    let query = `
    SELECT 
      jl.id,
      je.entry_number as entryNumber,
      je.entry_date as date,
      je.entry_type as entryType,
      a.code as accountCode,
      a.name as accountName,
      a.id as accountId,
      jl.debit,
      jl.credit,
      jl.description,
      je.reference_type as referenceType,
      je.reference_id as referenceId
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    JOIN accounts a ON jl.account_id = a.id
    WHERE 1=1
  `;
    const params = [];
    if (filters.referenceId) {
        query += ` AND je.reference_id = ?`;
        params.push(filters.referenceId);
    }
    if (filters.accountId) {
        query += ` AND jl.account_id = ?`;
        params.push(filters.accountId);
    }
    query += ` ORDER BY je.entry_date DESC, je.entry_number DESC, jl.line_order ASC`;
    const rows = database_1.db.prepare(query).all(...params);
    return rows.map(r => ({
        ...r,
        debit: (0, decimal_1.numVal)(r.debit),
        credit: (0, decimal_1.numVal)(r.credit)
    }));
}
