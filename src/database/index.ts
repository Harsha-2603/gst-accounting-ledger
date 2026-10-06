import Database, { Database as DatabaseType } from 'better-sqlite3';
import { config } from '../config';

export const db: DatabaseType = new Database(config.databasePath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_settings (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      gstin TEXT NOT NULL,
      state_code TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'INR'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gstin TEXT,
      state_code TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      balance TEXT NOT NULL DEFAULT '0.0000',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      unit_price TEXT NOT NULL,
      default_tax_rate TEXT NOT NULL,
      income_account_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (income_account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      entry_number TEXT UNIQUE NOT NULL,
      entry_date TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      narration TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      debit TEXT NOT NULL DEFAULT '0.0000',
      credit TEXT NOT NULL DEFAULT '0.0000',
      description TEXT,
      line_order INTEGER NOT NULL,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      place_of_supply TEXT NOT NULL,
      status TEXT NOT NULL,
      subtotal TEXT NOT NULL,
      cgst_amount TEXT NOT NULL,
      sgst_amount TEXT NOT NULL,
      igst_amount TEXT NOT NULL,
      total_amount TEXT NOT NULL,
      paid_amount TEXT NOT NULL DEFAULT '0.0000',
      due_amount TEXT NOT NULL,
      journal_entry_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      description TEXT,
      hsn_code TEXT NOT NULL,
      quantity TEXT NOT NULL,
      unit_price TEXT NOT NULL,
      tax_rate TEXT NOT NULL,
      taxable_amount TEXT NOT NULL,
      cgst_rate TEXT NOT NULL,
      cgst_amount TEXT NOT NULL,
      sgst_rate TEXT NOT NULL,
      sgst_amount TEXT NOT NULL,
      igst_rate TEXT NOT NULL,
      igst_amount TEXT NOT NULL,
      total_line_amount TEXT NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount TEXT NOT NULL,
      deposit_account_id TEXT NOT NULL,
      reference_number TEXT,
      journal_entry_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (deposit_account_id) REFERENCES accounts(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      allocated_amount TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      request_hash TEXT,
      response_body TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  seedDefaultData();
}

function seedDefaultData(): void {
  const now = new Date().toISOString();

  // Organization Settings
  const orgCount = (db.prepare('SELECT COUNT(*) as count FROM organization_settings').get() as any).count;
  if (orgCount === 0) {
    db.prepare(`
      INSERT INTO organization_settings (id, legal_name, gstin, state_code, base_currency)
      VALUES (?, ?, ?, ?, ?)
    `).run('org_default', 'Maharashtra Wholesale Enterprises', '27AAACW1234F1Z5', config.defaultStateCode, config.baseCurrency);
  }

  // Pre-seeded Chart of Accounts
  const seedAccounts = [
    { id: 'acc_cash_1000', code: '1000', name: 'Cash on Hand', type: 'ASSET', normal_balance: 'DEBIT' },
    { id: 'acc_bank_1010', code: '1010', name: 'Bank Checking Account', type: 'ASSET', normal_balance: 'DEBIT' },
    { id: 'acc_ar_1200', code: '1200', name: 'Accounts Receivable', type: 'ASSET', normal_balance: 'DEBIT' },
    { id: 'acc_cgst_2110', code: '2110', name: 'Output CGST Payable', type: 'LIABILITY', normal_balance: 'CREDIT' },
    { id: 'acc_sgst_2120', code: '2120', name: 'Output SGST Payable', type: 'LIABILITY', normal_balance: 'CREDIT' },
    { id: 'acc_igst_2130', code: '2130', name: 'Output IGST Payable', type: 'LIABILITY', normal_balance: 'CREDIT' },
    { id: 'acc_sales_4000', code: '4000', name: 'Sales Income', type: 'INCOME', normal_balance: 'CREDIT' }
  ];

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (id, code, name, type, normal_balance, balance, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, '0.0000', 1, ?)
  `);

  for (const acc of seedAccounts) {
    insertAccount.run(acc.id, acc.code, acc.name, acc.type, acc.normal_balance, now);
  }

  // Seed Default Customers
  const customerCount = (db.prepare('SELECT COUNT(*) as count FROM customers').get() as any).count;
  if (customerCount === 0) {
    db.prepare(`
      INSERT INTO customers (id, name, gstin, state_code, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('cust_intra_27', 'Mumbai Traders Pvt Ltd', '27BBBCA5678G2Z9', '27', 'contact@mumbaitraders.in', '9820098200', now);

    db.prepare(`
      INSERT INTO customers (id, name, gstin, state_code, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('cust_inter_24', 'Ahmedabad Distributors LLC', '24CCCDD9012H3Z1', '24', 'info@ahmedabad-dist.in', '9898098980', now);
  }

  // Seed Default Items
  const itemCount = (db.prepare('SELECT COUNT(*) as count FROM items').get() as any).count;
  if (itemCount === 0) {
    db.prepare(`
      INSERT INTO items (id, name, hsn_code, unit_price, default_tax_rate, income_account_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('item_pc_8471', 'Dell OptiPlex 7090 Desktop', '8471', '50000.0000', '18.00', 'acc_sales_4000', now);

    db.prepare(`
      INSERT INTO items (id, name, hsn_code, unit_price, default_tax_rate, income_account_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('item_paper_4802', 'A4 Printing Paper Bundle', '4802', '500.0000', '12.00', 'acc_sales_4000', now);
  }
}

// Auto-initialize schema on import
initDatabase();

export function resetLedger(): void {
  db.transaction(() => {
    db.exec(`
      DELETE FROM payment_allocations;
      DELETE FROM payments;
      DELETE FROM invoice_lines;
      DELETE FROM invoices;
      DELETE FROM journal_lines;
      DELETE FROM journal_entries;
      DELETE FROM idempotency_keys;
      UPDATE accounts SET balance = '0.0000';
    `);
  })();
}

