import { db } from '../database';
import { toDec, fmtDec, numVal } from '../domain/decimal';
import { NotFoundError } from '../errors';

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

export function getAccountBalance(accountId: string): number {
  const acc = db.prepare('SELECT balance FROM accounts WHERE id = ? OR code = ?').get(accountId, accountId) as any;
  if (!acc) {
    throw new NotFoundError(`Account '${accountId}' not found.`);
  }
  return numVal(acc.balance);
}

export function updateAccountBalance(accountId: string, debit: any, credit: any): string {
  const account = db.prepare('SELECT id, normal_balance, balance FROM accounts WHERE id = ?').get(accountId) as any;
  if (!account) {
    throw new NotFoundError(`Account '${accountId}' not found in Chart of Accounts.`);
  }

  const debitDec = toDec(debit);
  const creditDec = toDec(credit);
  let netChangeDec = toDec(0);

  if (account.normal_balance === 'DEBIT') {
    netChangeDec = debitDec.minus(creditDec);
  } else {
    netChangeDec = creditDec.minus(debitDec);
  }

  const newBalDec = toDec(account.balance).plus(netChangeDec);
  const newBalStr = fmtDec(newBalDec);

  db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(newBalStr, account.id);
  return newBalStr;
}

export function recalculateAllAccountBalances(): void {
  const accounts = db.prepare('SELECT id, normal_balance FROM accounts').all() as any[];

  db.transaction(() => {
    for (const acc of accounts) {
      const totals = db.prepare(`
        SELECT 
          COALESCE(SUM(CAST(debit AS REAL)), 0) as totalDebit,
          COALESCE(SUM(CAST(credit AS REAL)), 0) as totalCredit
        FROM journal_lines
        WHERE account_id = ?
      `).get(acc.id) as any;

      const debitDec = toDec(totals.totalDebit);
      const creditDec = toDec(totals.totalCredit);
      let netBalDec = toDec(0);

      if (acc.normal_balance === 'DEBIT') {
        netBalDec = debitDec.minus(creditDec);
      } else {
        netBalDec = creditDec.minus(debitDec);
      }

      db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(fmtDec(netBalDec), acc.id);
    }
  })();
}
