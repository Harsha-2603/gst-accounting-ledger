# OBSERVATIONS.md — Clean-Room Technical Observations of Bigcapital

This document compiles verified, source-code-backed technical observations of the Bigcapital accounting SaaS platform. Every factual statement is indexed with exact code evidence. Zero unsupported ("Guess") claims are included.

---

## 1. Repository / Stack

- **Monorepo Architecture**: Bigcapital is structured as a pnpm + Lerna monorepo with independent versioning across packages.
  Evidence: `lerna.json:2-3` [Confirmed]
- **Node Engine Compatibility**: The root configuration targets Node.js engines `^16.14.0 || ^17.0.0 || ^18.0.0` with pnpm package manager.
  Evidence: `package.json:67` [Confirmed]
- **Server Framework**: `@bigcapital/server` is built on NestJS v10 (`@nestjs/core: 10.3.0`, `@nestjs/common: 10.3.0`, `@nestjs/platform-express: 10.3.0`).
  Evidence: `packages/server/package.json:59-61` [Confirmed]
- **CLI Compilation**: The server CLI (`src/cli.ts`) is compiled independently via Nest CLI config.
  Evidence: `packages/server/nest-cli.json:11-25` [Confirmed]
- **Database Engine**: The application targets MariaDB / MySQL.
  Evidence: `packages/server/package.json:96` [Confirmed]
- **Data Access & ORM**: Data persistence is implemented using Knex query builder (`knex: 3.1.0`) and Objection.js ORM (`objection: 3.1.3`).
  Evidence: `packages/server/package.json:96, 114` [Confirmed]
- **Frontend Framework**: `@bigcapital/webapp` is a React Single Page Application (SPA) bundled via Vite (`vite: 4.5.2`) using React 18 (`react: 18.2.0`).
  Evidence: `packages/webapp/package.json:11, 84` [Confirmed]
- **UI Design System**: The web frontend is built primarily with Palantir BlueprintJS (`@blueprintjs/core: 4.20.0`, `@blueprintjs/select: 4.14.0`, `@blueprintjs/datetime: 4.4.0`).
  Evidence: `packages/webapp/package.json:11-13` [Confirmed]
- **Background Jobs**: Asynchronous background jobs and processing pipelines use BullMQ (`bullmq: 5.4.1`) backed by Redis (`ioredis: 5.3.2`).
  Evidence: `packages/server/package.json:71, 95` [Confirmed]
- **PDF Generation**: Document PDF export is handled via Gotenberg service over HTTP (`gotenberg-js-client: 1.1.0`).
  Evidence: `packages/server/package.json:92` [Confirmed]
- **Object Storage**: Attachments and files are stored in S3-compatible object storage (Garage S3 in local development) using AWS S3 SDK (`@aws-sdk/client-s3: 3.515.0`).
  Evidence: `packages/server/package.json:34` [Confirmed]
- **Event Bus**: Internal decoupled communications use NestJS EventEmitter (`@nestjs/event-emitter: 2.0.4`).
  Evidence: `packages/server/package.json:63` [Confirmed]

---

## 2. Product Behavior

- **Multi-Tenancy Model**: Multi-tenancy uses a hybrid database isolation strategy: one shared System Database stores tenants, subscriptions, and users, while each organization tenant gets an isolated MariaDB database.
  Evidence: `packages/server/src/modules/Tenancy/TenancyManager.service.ts:45-80` [Confirmed]
- **Dual Migration System**: System database migrations (`packages/server/src/database/system/migrations/`) and tenant database migrations (`packages/server/src/database/tenant/migrations/`) are executed via separate CLI commands.
  Evidence: `package.json:35-39` [Confirmed]
- **Authorization Engine**: Role-based access control utilizes CASL (`@casl/ability: 5.4.4`).
  Evidence: `packages/server/package.json:72` and `packages/server/src/modules/Roles/Roles.types.ts:1-26` [Confirmed]
- **Wire Case Conversion**: The API wire protocol is strictly `snake_case`, converted dynamically to/from `camelCase` DTOs by a global interceptor (`SerializeInterceptor`).
  Evidence: `packages/server/src/common/interceptors/serialize.interceptor.ts:15-60` [Confirmed]
- **Client SDK**: A TypeScript client is generated from OpenAPI specifications via `openapi-typescript`.
  Evidence: `shared/sdk-ts/package.json:20-35` [Confirmed]

---

## 3. Accounting Subsystem

- **Transaction Ledger Entity**: Double-entry journal lines are stored in the tenant table `accounts_transactions`.
  Evidence: `packages/server/src/database/tenant/migrations/20200104232647_create_accounts_transactions_table.ts:3-30` [Confirmed]
- **Chart of Accounts Entity**: Account definitions and balances are stored in `accounts`.
  Evidence: `packages/server/src/database/tenant/migrations/20190822214303_create_accounts_table.ts:3-23` [Confirmed]
- **Account Types**: Accounts are classified into standard categories (`Asset`, `Liability`, `Equity`, `Income`, `Expense`).
  Evidence: `packages/server/src/modules/Accounts/constants.ts:15-45` [Confirmed]
- **Denormalized Balance Storage**: `accounts.amount` stores the current running balance as `decimal(15, 5)`.
  Evidence: `packages/server/src/database/tenant/migrations/20190822214303_create_accounts_table.ts:18` [Confirmed]
- **Ledger Storage Service**: The ledger commit pipeline orchestrates transaction row writes, account balance updates, and contact balance updates concurrently via `Promise.all`.
  Evidence: `packages/server/src/modules/Ledger/LedgerStorage.service.ts:41-51` [Confirmed]
- **Unbalanced Insertion Vulnerability**: Core `LedgerEntriesStorageService.saveEntries` does not validate that $\sum \text{Debit} == \sum \text{Credit}$ before pushing rows to the database insert queue.
  Evidence: `packages/server/src/modules/Ledger/LedgerEntriesStorage.service.ts:35-43` [Confirmed]

---

## 4. Invoice Subsystem

- **Invoice Entity**: Customer sales invoices are stored in `sales_invoices`.
  Evidence: `packages/server/src/database/tenant/migrations/20200612192644_create_sales_invoices_table.ts:3-35` [Confirmed]
- **Line Items Entity**: Individual line items are stored in `items_entries` linked by polymorphic `reference_id` and `reference_type = 'SaleInvoice'`.
  Evidence: `packages/server/src/database/tenant/migrations/20200508182741_create_items_entries_table.ts:3-30` [Confirmed]
- **Creation Endpoint**: New sales invoices are received via `POST /api/sale-invoices`.
  Evidence: `packages/server/src/modules/SaleInvoices/SaleInvoices.controller.ts:110-119` [Confirmed]
- **Posting Trigger (`deliveredAt`)**: Invoices do not post journal entries while in draft state. Posting occurs only when `deliveredAt` is populated.
  Evidence: `packages/server/src/modules/SaleInvoices/subscribers/InvoiceGLEntriesSubscriber.ts:28` [Confirmed]
- **Invoice GL Double-Entry Structure**: When delivered, an invoice posts:
  - Debit: Accounts Receivable (`ARAccountId`) for the total invoice amount.
  - Credit: Sales Income (`sellAccountId`) per item line excluding tax.
  - Credit: Tax Payable (`taxPayableAccountId`) for the total tax collected.
  Evidence: `packages/server/src/modules/SaleInvoices/ledger/InvoiceGL.ts:87-145` [Confirmed]
- **Discount Expense Inversion Defect**: `InvoiceGL.ts` sets `accountNormal: AccountNormal.CREDIT` on the customer discount entry despite assigning a debit amount, causing discounts to decrease the discount expense balance.
  Evidence: `packages/server/src/modules/SaleInvoices/ledger/InvoiceGL.ts:151-160` [Confirmed]

---

## 5. Payment Subsystem

- **Payment Entity**: Customer remittances are recorded in `payment_receives`.
  Evidence: `packages/server/src/database/tenant/migrations/20200624233214_create_payment_receives_table.ts:3-30` [Confirmed]
- **Payment Line Allocation**: Payment allocations to specific invoices are stored in `payment_receives_entries`.
  Evidence: `packages/server/src/database/tenant/migrations/20200624233220_create_payment_receives_entries_table.ts:3-25` [Confirmed]
- **Creation Endpoint**: Payments are posted via `POST /api/payment-receives`.
  Evidence: `packages/server/src/modules/PaymentReceived/PaymentsReceived.controller.ts:122-131` [Confirmed]
- **Invoice Reconciliation**: Creating a payment increments `sales_invoices.paid_amount` and decrements `sales_invoices.due_amount`.
  Evidence: `packages/server/src/modules/PaymentReceived/PaymentReceivePaymentEntries.service.ts:135-155` [Confirmed]
- **Payment GL Double-Entry Structure**: A payment posts:
  - Debit: Deposit Account (`depositAccountId`, e.g., Cash or Bank) for the payment amount.
  - Credit: Accounts Receivable (`ARAccountId`) for the payment amount.
  Evidence: `packages/server/src/modules/PaymentReceived/PaymentReceiveGL.ts:40-75` [Confirmed]

---

## 6. Journal Entries Subsystem

- **Manual Journal Entity**: Manual multi-line adjustments are recorded in `manual_journals` and `manual_journal_entries`.
  Evidence: `packages/server/src/database/tenant/migrations/20200810185918_create_manual_journals_tables.ts:3-40` [Confirmed]
- **Manual Journal Balance Check**: Unlike the automated services, manual journals explicitly enforce that debits equal credits before saving.
  Evidence: `packages/server/src/modules/ManualJournals/commands/CommandManualJournalValidators.service.ts:46-48` [Confirmed]
- **Audit Table Link**: Manual journal lines write into `accounts_transactions` with `reference_type = 'ManualJournal'`.
  Evidence: `packages/server/src/modules/ManualJournals/ledger/ManualJournalGL.ts:30-65` [Confirmed]

---

## 7. Financial Reports Subsystem

- **Reporting Service Structure**: Reporting features reside under `packages/server/src/modules/FinancialStatements/`.
  Evidence: `packages/server/src/modules/FinancialStatements/FinancialStatements.module.ts:15-50` [Confirmed]
- **Trial Balance Endpoint**: The Trial Balance report is exposed via `GET /api/financial-statements/trial-balance`.
  Evidence: `packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheet.controller.ts:51-65` [Confirmed]
- **Balance Sheet Endpoint**: Balance Sheet is queried via `GET /api/financial-statements/balance-sheet`.
  Evidence: `packages/server/src/modules/FinancialStatements/modules/BalanceSheet/BalanceSheet.controller.ts:45-60` [Confirmed]
- **Profit and Loss Endpoint**: Income statement is queried via `GET /api/financial-statements/profit-and-loss`.
  Evidence: `packages/server/src/modules/FinancialStatements/modules/ProfitLossSheet/ProfitLossSheet.controller.ts:45-60` [Confirmed]
- **General Ledger Endpoint**: Full ledger transaction history is queried via `GET /api/financial-statements/general-ledger`.
  Evidence: `packages/server/src/modules/FinancialStatements/modules/GeneralLedger/GeneralLedger.controller.ts:45-60` [Confirmed]

---

## 8. Void / Reversal Subsystem

- **No Soft Void Status**: `sales_invoices` has no `status = 'VOID'` column or soft-void state. Cancellation is handled as hard deletion.
  Evidence: `packages/server/src/database/tenant/migrations/20200612192644_create_sales_invoices_table.ts:3-35` [Confirmed]
- **Delete Invoice Endpoint**: Invoice cancellation is executed via `DELETE /api/sale-invoices/:id`.
  Evidence: `packages/server/src/modules/SaleInvoices/SaleInvoices.controller.ts:74-85` [Confirmed]
- **In-Memory Reversal Delta**: Reversal reads transactions, swaps debits and credits in memory (`Ledger.reverse()`), and applies compensating balance adjustments to `accounts.amount`.
  Evidence: `packages/server/src/modules/Ledger/LedgerStorage.service.ts:107-118` and `Ledger.ts:213-221` [Confirmed]
- **Physical Record Deletion**: `LedgerStorageService` executes SQL `DELETE FROM accounts_transactions WHERE id IN (...)`, permanently destroying transaction history.
  Evidence: `packages/server/src/modules/Ledger/LedgerStorage.service.ts:80-83` [Confirmed]
- **Payment Guard**: An invoice cannot be deleted or reversed if associated payment receive entries exist.
  Evidence: `packages/server/src/modules/SaleInvoices/commands/DeleteSaleInvoice.service.ts:91-97` [Confirmed]

---

## 9. Trial Balance Subsystem

- **Direct SQL Aggregation**: The Trial Balance aggregates transactions up to `toDate` directly from `accounts_transactions` using SQL `GROUP BY accountId` with `SUM(debit)` and `SUM(credit)`.
  Evidence: `packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetRepository.ts:87-100` [Confirmed]
- **Summary Row Equilibrium**: The Trial Balance table appends a total summary row summing all debit and credit columns.
  Evidence: `packages/server/src/modules/FinancialStatements/modules/TrialBalanceSheet/TrialBalanceSheetTable.ts:120-168` [Confirmed]
- **Accrual vs Cash Label Discrepancy**: The webapp Trial Balance table UI displays `basis={'cash'}` while the underlying query aggregates all transactions accrued to date.
  Evidence: `packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceSheetTable.tsx:35` [Confirmed]

---

## 10. GST / Tax Subsystem

- **Flat Tax Scalar Storage**: Tax rates are stored in `tax_rates` with a single scalar `rate: decimal(10, 4)`.
  Evidence: `packages/server/src/models/TaxRate.ts:1-30` [Confirmed]
- **Absence of Dual CGST / SGST**: Zero columns, fields, or logic exist for splitting tax into Central GST (CGST) and State GST (SGST).
  Evidence: Full codebase search yields 0 matches for `cgst` [Confirmed Absent]
- **Absence of IGST**: No inter-state tax logic or IGST liability accounts exist.
  Evidence: Full codebase search yields 0 matches for `igst` [Confirmed Absent]
- **Absence of HSN / SAC Codes**: Items have no `hsn_code` attribute.
  Evidence: `packages/server/src/database/tenant/migrations/20200508182741_create_items_table.ts:1-30` [Confirmed Absent]
- **Single Liability Lump-Sum Posting**: All tax computed on invoice line items is credited to a single generic account (`taxPayableAccountId`).
  Evidence: `packages/server/src/modules/SaleInvoices/ledger/InvoiceGL.ts:132-145` [Confirmed]

---

## 11. Routes & Screens

- **Invoice Form Route**: `/invoices/new` renders `InvoiceFormPage.tsx` -> `InvoiceForm.tsx`.
  Evidence: `packages/webapp/src/routes/dashboard.tsx:831-845` [Confirmed]
- **Payment Received Form Route**: `/payment-received/new` renders `PaymentReceiveFormPage.tsx` -> `PaymentReceiveForm.tsx`.
  Evidence: `packages/webapp/src/routes/dashboard.tsx:1022-1036` [Confirmed]
- **Trial Balance Sheet Route**: `/financial-reports/trial-balance-sheet` renders `TrialBalanceSheet.tsx`.
  Evidence: `packages/webapp/src/routes/dashboard.tsx:264-279` [Confirmed]
- **Invoice Details Drawer**: Invoice drawer is opened on `/invoices` and displays action buttons for Edit, Delete, Quick Payment, and GL Entries.
  Evidence: `packages/webapp/src/containers/Drawers/InvoiceDetailDrawer/InvoiceDetailActionsBar.tsx:70-200` [Confirmed]
- **Invoice GL Entries Drawer Tab**: The invoice drawer renders `InvoiceGLEntriesTable.tsx`, querying `GET /api/transactions?reference_id=:id&reference_type=SaleInvoice`.
  Evidence: `packages/webapp/src/containers/Drawers/InvoiceDetailDrawer/InvoiceGLEntriesTable.tsx:18-36` [Confirmed]

---

## 12. Data Schema & Precision

- **Precision Mismatch**:
  - `accounts_transactions.credit` and `debit` are `decimal(13, 3)`.
    Evidence: `packages/server/src/database/tenant/migrations/20200104232647_create_accounts_transactions_table.ts:5-6` [Confirmed]
  - `accounts.amount` is `decimal(15, 5)`.
    Evidence: `packages/server/src/database/tenant/migrations/20190822214303_create_accounts_table.ts:18` [Confirmed]
  - `items_entries.rate` is `decimal(15, 5)`.
    Evidence: `packages/server/src/database/tenant/migrations/20231202124014_change_item_entries_rate_to_float.ts:3` [Confirmed]
- **Foreign Key Constraints**: `accounts_transactions.account_id` references `accounts.id`.
  Evidence: `packages/server/src/database/tenant/migrations/20200104232647_create_accounts_transactions_table.ts:10-15` [Confirmed]

---

## 13. Important Implementation Observations

- **Orphaned Documentation Artifact (MongoDB)**: `CONTRIBUTING.md:66` references `bigcapital-mongo` on port 27017, but MongoDB is not present in `docker-compose.yml` or runtime dependencies.
  Evidence: `CONTRIBUTING.md:66` [Confirmed] vs `docker-compose.yml:1-85` [Confirmed]
- **Typo in Internal Class Name**: `LedgetAccountStorage.service.ts` contains class name typo `export class LedegrAccountsStorage`.
  Evidence: `packages/server/src/modules/Ledger/LedgetAccountStorage.service.ts:15` [Confirmed]
- **Lack of Idempotency Headers**: Server controllers contain no middleware or handling for `Idempotency-Key` headers.
  Evidence: Full scan of `packages/server/src/` yields 0 idempotency handlers [Confirmed Absent]
