import { db } from '../database';
import crypto from 'crypto';
import { fmtDec, numVal } from '../domain/decimal';
import { ConflictError, BadRequestError } from '../errors';

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

export function getAccounts(): AccountDTO[] {
  const rows = db.prepare(`
    SELECT id, code, name, type, normal_balance as normalBalance, balance, is_active as isActive, created_at as createdAt
    FROM accounts
    ORDER BY code ASC
  `).all() as any[];

  return rows.map(acc => ({
    ...acc,
    balance: numVal(acc.balance),
    isActive: Boolean(acc.isActive)
  }));
}

export function getAccountById(id: string): AccountDTO | null {
  const acc = db.prepare(`
    SELECT id, code, name, type, normal_balance as normalBalance, balance, is_active as isActive, created_at as createdAt
    FROM accounts
    WHERE id = ? OR code = ?
  `).get(id, id) as any;

  if (!acc) return null;
  return {
    ...acc,
    balance: numVal(acc.balance),
    isActive: Boolean(acc.isActive)
  };
}

export function createAccount(data: { code: string; name: string; type: string; normalBalance: string }): AccountDTO {
  const { code, name, type, normalBalance } = data;

  const existing = db.prepare('SELECT id FROM accounts WHERE code = ?').get(code);
  if (existing) {
    throw new ConflictError(`Account with code '${code}' already exists.`);
  }

  const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
  if (!validTypes.includes(type)) {
    throw new BadRequestError(`Invalid account type '${type}'. Must be one of: ${validTypes.join(', ')}`);
  }

  const validNormals = ['DEBIT', 'CREDIT'];
  if (!validNormals.includes(normalBalance)) {
    throw new BadRequestError(`Invalid normal balance '${normalBalance}'. Must be DEBIT or CREDIT.`);
  }

  const id = 'acc_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO accounts (id, code, name, type, normal_balance, balance, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, '0.0000', 1, ?)
  `).run(id, code, name, type, normalBalance, now);

  return getAccountById(id)!;
}
