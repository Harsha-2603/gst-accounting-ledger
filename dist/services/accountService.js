"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccounts = getAccounts;
exports.getAccountById = getAccountById;
exports.createAccount = createAccount;
const database_1 = require("../database");
const crypto_1 = __importDefault(require("crypto"));
const decimal_1 = require("../domain/decimal");
const errors_1 = require("../errors");
function getAccounts() {
    const rows = database_1.db.prepare(`
    SELECT id, code, name, type, normal_balance as normalBalance, balance, is_active as isActive, created_at as createdAt
    FROM accounts
    ORDER BY code ASC
  `).all();
    return rows.map(acc => ({
        ...acc,
        balance: (0, decimal_1.numVal)(acc.balance),
        isActive: Boolean(acc.isActive)
    }));
}
function getAccountById(id) {
    const acc = database_1.db.prepare(`
    SELECT id, code, name, type, normal_balance as normalBalance, balance, is_active as isActive, created_at as createdAt
    FROM accounts
    WHERE id = ? OR code = ?
  `).get(id, id);
    if (!acc)
        return null;
    return {
        ...acc,
        balance: (0, decimal_1.numVal)(acc.balance),
        isActive: Boolean(acc.isActive)
    };
}
function createAccount(data) {
    const { code, name, type, normalBalance } = data;
    const existing = database_1.db.prepare('SELECT id FROM accounts WHERE code = ?').get(code);
    if (existing) {
        throw new errors_1.ConflictError(`Account with code '${code}' already exists.`);
    }
    const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
    if (!validTypes.includes(type)) {
        throw new errors_1.BadRequestError(`Invalid account type '${type}'. Must be one of: ${validTypes.join(', ')}`);
    }
    const validNormals = ['DEBIT', 'CREDIT'];
    if (!validNormals.includes(normalBalance)) {
        throw new errors_1.BadRequestError(`Invalid normal balance '${normalBalance}'. Must be DEBIT or CREDIT.`);
    }
    const id = 'acc_' + crypto_1.default.randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    database_1.db.prepare(`
    INSERT INTO accounts (id, code, name, type, normal_balance, balance, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, '0.0000', 1, ?)
  `).run(id, code, name, type, normalBalance, now);
    return getAccountById(id);
}
