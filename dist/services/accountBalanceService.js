"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountBalance = getAccountBalance;
exports.updateAccountBalance = updateAccountBalance;
exports.recalculateAllAccountBalances = recalculateAllAccountBalances;
const database_1 = require("../database");
const decimal_1 = require("../domain/decimal");
const errors_1 = require("../errors");
/**
 * Account Balance Service
 * Dedicated service for managing and recalculating general ledger account balances.
 */
function getAccountBalance(accountId) {
    const acc = database_1.db.prepare('SELECT balance FROM accounts WHERE id = ? OR code = ?').get(accountId, accountId);
    if (!acc) {
        throw new errors_1.NotFoundError(`Account '${accountId}' not found.`);
    }
    return (0, decimal_1.numVal)(acc.balance);
}
function updateAccountBalance(accountId, debit, credit) {
    const account = database_1.db.prepare('SELECT id, normal_balance, balance FROM accounts WHERE id = ?').get(accountId);
    if (!account) {
        throw new errors_1.NotFoundError(`Account '${accountId}' not found in Chart of Accounts.`);
    }
    const debitDec = (0, decimal_1.toDec)(debit);
    const creditDec = (0, decimal_1.toDec)(credit);
    let netChangeDec = (0, decimal_1.toDec)(0);
    if (account.normal_balance === 'DEBIT') {
        netChangeDec = debitDec.minus(creditDec);
    }
    else {
        netChangeDec = creditDec.minus(debitDec);
    }
    const newBalDec = (0, decimal_1.toDec)(account.balance).plus(netChangeDec);
    const newBalStr = (0, decimal_1.fmtDec)(newBalDec);
    database_1.db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(newBalStr, account.id);
    return newBalStr;
}
function recalculateAllAccountBalances() {
    const accounts = database_1.db.prepare('SELECT id, normal_balance FROM accounts').all();
    database_1.db.transaction(() => {
        for (const acc of accounts) {
            const totals = database_1.db.prepare(`
        SELECT 
          COALESCE(SUM(CAST(debit AS REAL)), 0) as totalDebit,
          COALESCE(SUM(CAST(credit AS REAL)), 0) as totalCredit
        FROM journal_lines
        WHERE account_id = ?
      `).get(acc.id);
            const debitDec = (0, decimal_1.toDec)(totals.totalDebit);
            const creditDec = (0, decimal_1.toDec)(totals.totalCredit);
            let netBalDec = (0, decimal_1.toDec)(0);
            if (acc.normal_balance === 'DEBIT') {
                netBalDec = debitDec.minus(creditDec);
            }
            else {
                netBalDec = creditDec.minus(debitDec);
            }
            database_1.db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run((0, decimal_1.fmtDec)(netBalDec), acc.id);
        }
    })();
}
