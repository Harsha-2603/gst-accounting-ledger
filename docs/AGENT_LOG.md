# AGENT_LOG.md — Reverse-Engineering Log & Chronology

This log documents the stage-by-stage reverse-engineering trajectory, evidence discoveries, corrections, and architectural decisions made by the agent team while analyzing Bigcapital for the HACKBACK GST-Ready Accounting Ledger challenge.

---

## 1. Stage-by-Stage Chronology

### Stage 0: Reconnaissance
- **User Prompt**: "What is this codebase made of, and how is it laid out? Read the repository only. Identify tech stack, local commands, and repository map."
- **Key Findings**:
  - Identified pnpm + Lerna monorepo (`lerna.json:2-3`).
  - Cataloged exact dependencies: NestJS v10 (`@nestjs/core: 10.3.0`), MariaDB + Knex (`knex: 3.1.0`) + Objection (`objection: 3.1.3`), React 18 + Vite (`vite: 4.5.2`) + BlueprintJS (`@blueprintjs/core: 4.20.0`).
  - Identified background infrastructure: BullMQ (`bullmq: 5.4.1`) + Redis (`ioredis: 5.3.2`), Gotenberg (`:9000`), Garage S3 (`:3900`).
  - Located top 10 accounting files centered on `Ledger`, `SaleInvoices`, `PaymentReceived`, `FinancialStatements`, `Accounts`.
- **Anomalies Detected**:
  - Found stale reference to MongoDB in `CONTRIBUTING.md:66` (`bigcapital-mongo` on port 27017). Cross-checked with `docker-compose.yml` and verified MongoDB is not in the active stack.

### Stage 1: Big Picture
- **User Prompt**: "Explain Bigcapital as a product. 3-sentence summary, user roles, main features, accounting hard core."
- **Key Findings**:
  - Product role: Multi-tenant SaaS accounting tool for small businesses.
  - Roles: `admin`, `staff`, and custom granular permissions powered by CASL (`@casl/ability: 5.4.4`).
  - Proved that Bigcapital has zero native awareness of Indian GST, CGST, SGST, IGST, or HSN codes. Tax is modeled as a single flat scalar (`tax_rates.rate`).

### Stage 2: Architecture & Mermaid
- **User Prompt**: "Reverse-engineer the actual architecture of Bigcapital. Create Mermaid graph LR. Detail components, responsibilities, data flow, state locations."
- **Key Findings**:
  - Reverse-engineered dual-database architecture: System DB (tenants, subscriptions) vs Tenant DBs (accounts, invoices, ledger).
  - Traced wire format case conversions: Client camelCase $\to$ SDK snake_case $\to$ Server `SerializeInterceptor` camelCase DTOs $\to$ Snake_case DB columns.
  - Documented state distribution across MariaDB, Redis queues, browser localStorage, and server CLS (Continuation Local Storage).

### Stage 3: Routes & Screens
- **User Prompt**: "Find every real entry point into Bigcapital. Tables for backend API routes and frontend webapp screens. Map killer test interaction points."
- **Key Findings**:
  - Cataloged 89 controller files, 384 route handlers, and 124 declared webapp screens (95 dashboard, 20 preferences, 6 auth, 3 top-level).
  - Identified core endpoints:
    - Invoices: `POST /api/sale-invoices`, `DELETE /api/sale-invoices/:id`
    - Payments: `POST /api/payment-receives`
    - Reports: `GET /api/financial-statements/trial-balance`
  - Mapped Killer Test interaction surfaces: invoice creation, payment reconciliation, invoice deletion, and trial balance SQL query.

### Stage 4: Data Model / ER
- **User Prompt**: "Document the actual Bigcapital data model. Mermaid erDiagram, entity tables, accounting relationships."
- **Key Findings**:
  - Constructed relational map linking `accounts`, `accounts_transactions`, `sales_invoices`, `items_entries`, `payment_receives`, `payment_receives_entries`.
  - Discovered critical precision mismatch: `accounts_transactions.debit/credit` is `decimal(13, 3)`, while `accounts.amount` is `decimal(15, 5)`.
  - Proved that invoices post double entries only when `delivered_at` is populated (`InvoiceGLEntriesSubscriber.ts:28`).

### Stage 5: Trace the Accounting Hard Core
- **User Prompt**: "Trace the accounting hard core end-to-end using actual Bigcapital code. Traces for Invoice, Payment, Reversal, Trial Balance."
- **Key Findings**:
  - **Trace A (Invoice)**: Form $\to$ `POST /api/sale-invoices` $\to$ `CreateSaleInvoice.service.ts` $\to$ emits `onCreated` $\to$ `InvoiceGLEntriesSubscriber.ts` $\to$ `InvoiceGL.ts` $\to$ `LedgerStorageService.commit()` $\to$ inserts into `accounts_transactions` (DR: AR, CR: Sales, CR: Tax).
  - **Trace B (Payment)**: Form $\to$ `POST /api/payment-receives` $\to$ `CreatePaymentReceive.service.ts` $\to$ `PaymentReceivePaymentEntries.service.ts` (relieves invoice due amount) $\to$ `PaymentReceiveGL.ts` $\to$ inserts into `accounts_transactions` (DR: Cash/Bank, CR: AR).
  - **Trace C (Reversal / Void)**: UI clicks "Delete" $\to$ `DELETE /api/sale-invoices/:id` $\to$ `DeleteSaleInvoice.service.ts` $\to$ `LedgerStorageService.deleteByReference()` $\to$ reads transactions, calls in-memory `Ledger.reverse()`, updates `accounts.amount`, and executes hard physical deletion: `DELETE FROM accounts_transactions WHERE id IN (...)`.
  - **Trace D (Trial Balance)**: `GET /api/financial-statements/trial-balance` $\to$ `TrialBalanceSheetRepository.ts` executes `SELECT accountId, SUM(credit), SUM(debit) FROM accounts_transactions WHERE date <= :toDate GROUP BY accountId`.

### Stage 6: Screenshots to Accounting User Journey
- **User Prompt**: "Attach 1–3 screenshots of relevant screens. Identify screen, file, role, goal, action, API, data changed, accounting consequence, path:line. Trace complete primary user journey and void/reversal journey. Detail GST."
- **Key Findings**:
  - Mapped 3 genuinely routed screens:
    1. New Sales Invoice (`/invoices/new` $\to$ `InvoiceFormPage.tsx` / `InvoiceForm.tsx`)
    2. Record Payment Received (`/payment-received/new` $\to$ `PaymentReceiveFormPage.tsx` / `PaymentReceiveForm.tsx`)
    3. Trial Balance Sheet (`/financial-reports/trial-balance-sheet` $\to$ `TrialBalanceSheet.tsx` / `TrialBalanceSheetTable.tsx`)
  - Formulated the 7-step primary user journey from invoice creation to ledger settlement and trial balance verification.
  - Traced the invoice deletion alert modal (`InvoiceDeleteAlert.tsx`) as the physical reversal trigger.
  - Confirmed webapp line items table has only a single `"Tax rate"` column (`accessor: 'taxRateId'`).

### Stage 7: Gaps & Improvements
- **User Prompt**: "Find real gaps using source-code evidence. Investigate 12 specific areas. Select exactly Fix 1 and Differentiator 2."
- **Key Findings**:
  - Identified 12 evidence-backed gaps across accounting invariants, GST absence, audit destruction, normal balance inversions, precision drift, and race conditions.
  - Selected **Fix 1**: Zero-Trust Transaction Balancing Guard & Immutable Reversal Engine.
  - Selected **Differentiator 2**: Automated Indian GST Dual-Split Engine & Live GSTR-1 Compliance Table.

### Stage 8: Verify Every Claim
- **User Prompt**: "Audit everything told in Stages 0–7. Verify every claim, file:line citation, diagram box, arrow, route, screen, gap, killer test. Classify Confirmed/Likely/Guess."
- **Key Findings**:
  - Audited 38 distinct technical claims: 38 Confirmed, 0 Likely, 0 Guess.
  - Corrected permission decorator citations from hypothetical `ability.factory.ts` to verified `@RequirePermission` on `SaleInvoices.controller.ts:111`, `PaymentsReceived.controller.ts:123`, and `TrialBalanceSheet.controller.ts:51-55`.
  - Reconciled `items_entries.rate` migration: confirmed Knex code executed `decimal(15, 5).alter()`.

### Stage 9: Final Overnight Documentation
- **User Prompt**: "Produce the 7 implementation-ready documentation files for a completely new AI coding agent to rebuild the GST-Ready Accounting Ledger."
- **Action**: Authored `OBSERVATIONS.md`, `PRD.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API.md`, `GAPS.md`, and `AGENT_LOG.md`.

### Stage 10: Realignment of Differentiator (AI Accounting Copilot) & Core GST Scope
- **User Prompt**: "Change the Differentiator from GST to AI Accounting Copilot. Move Indian GST CGST/SGST functionality into core product requirements. Update GAPS.md, ARCHITECTURE.md, API.md, PRD.md, and AGENT_LOG.md before building."
- **Actions Taken**:
  1. **Differentiator Realignment**: Replaced GST Dual-Split with **AI Accounting Copilot** as Differentiator 2 in `GAPS.md` and `PRD.md`.
  2. **Core GST Classification**: Preserved Indian GST CGST/SGST 50/50 dual-split, IGST place-of-supply logic, HSN cataloging, and live GSTR-1 summary tables as **core MUST product requirements**.
  3. **Strict Read-Only Invariant Established**: Codified in `ARCHITECTURE.md` and `PRD.md` that the AI Copilot has zero mutation authority over invoices, payments, journal lines, GST rates, or ledger balances. Double-entry engine remains the sole source of truth.
  4. **API Specification Added**: Documented `POST /api/ai/copilot` in `API.md` with request/response schemas, grounded citation sources, disabled state response (`aiEnabled: false`), and 503 provider failure handling.
  5. **Environment Decoupling**: Documented `AI_ENABLED=false`, `AI_PROVIDER=`, `AI_API_KEY=`, `AI_MODEL=`. Application runs 100% normally without an AI key; key is never exposed to the frontend.
  6. **AI Testing Suite Formalized**: Specified 4 AI tests (AI Configured Grounded Answer, AI Disabled Normal Operation, Mutation Prevention, Provider Failure Resilience).
  7. **Execution Order Locked (Killer Tests First)**: Enforced build order: Core Accounting Engine $\to$ Killer Tests 1–3 $\to$ Fix 1 $\to$ AI Accounting Copilot $\to$ AI Tests 1–4 $\to$ Rerun Killer Tests 1–3 $\to$ Full Regression.

---

## 2. Evidence Corrections & Reconciliations

| Claim / Topic | Preliminary Citation | Verified Source Reality | Action Taken |
|---|---|---|---|
| **Controller Permissions** | `packages/server/src/modules/Auth/ability.factory.ts` | Enforced via `@RequirePermission()` decorator on individual controllers (`SaleInvoices.controller.ts:111`, `PaymentsReceived.controller.ts:123`), backed by enum in `Roles.types.ts:49-60`. | Corrected file paths and line numbers across all documentation. |
| **Line Item Rate Data Type** | `change_item_entries_rate_to_float.ts` (assumed `float`) | Knex migration line 3 explicitly ran `table.decimal('rate', 15, 5).alter()`. | Updated data model observations to reflect `decimal(15, 5)`. |
| **Sale Invoice Module Path** | `packages/server/src/modules/Sales/Invoices/` | Folder name on disk is `packages/server/src/modules/SaleInvoices/`. | Reconciled path references. |
| **MongoDB Service** | `CONTRIBUTING.md:66` references `bigcapital-mongo` | `docker-compose.yml` and dependencies confirm MariaDB only; MongoDB is completely absent. | Classified MongoDB as an orphaned documentation artifact. |

---

## 3. Rejected Assumptions & Hallucination Filters

1. **Rejected Assumption**: "Bigcapital has a GST configuration toggle for Indian users."
   - *Filter Applied*: Conducted full codebase grep for `cgst`, `sgst`, `igst`, `hsn`. Zero matches returned.
   - *Conclusion*: Native GST does not exist. Tax is strictly a single scalar percentage.
2. **Rejected Assumption**: "Voiding an invoice updates a `status` column to `VOID`."
   - *Filter Applied*: Inspected `sales_invoices` schema and `DeleteSaleInvoice.service.ts`.
   - *Conclusion*: Voiding is implemented as hard deletion (`DELETE FROM sales_invoices` and `DELETE FROM accounts_transactions`).
3. **Rejected Assumption**: "Core ledger checks that debits equal credits before saving."
   - *Filter Applied*: Inspected `LedgerEntriesStorageService.ts:35-43`.
   - *Conclusion*: Core ledger blindly commits line items without checking $\sum \text{Debit} == \sum \text{Credit}$. Balancing is only checked on manual journals.

---

## 4. Unresolved Unknowns

- **ClickHouse Analytics Sync**: The repository contains references to `LedgerClickHouseSink.service.ts` queuing ledger deltas to ClickHouse. The Docker environment does not spin up ClickHouse by default. For the clean-room rebuild, this analytics sink is designated out-of-scope.

---

## 5. Final Documentation Audit Sign-off

- [x] Exactly 7 docs exist in `docs/`.
- [x] `OBSERVATIONS.md` contains exact file:line evidence.
- [x] `PRD.md` contains Product Statement, User, Problem, Core Flow, MoSCoW, Out of Scope, and Given/When/Then criteria.
- [x] All 3 Killer Tests have explicit acceptance criteria.
- [x] `ARCHITECTURE.md` has complete Mermaid diagrams.
- [x] `DATA_MODEL.md` has Mermaid `erDiagram` and required constraints.
- [x] `API.md` includes inputs, outputs, permissions, errors, and accounting side-effects.
- [x] `GAPS.md` contains evidence-backed gaps, exactly 1 Fix, and exactly 1 Differentiator.
- [x] `AGENT_LOG.md` contains chronology, corrections, and audit metrics.
- [x] Zero Guess claims carried forward.
- [x] Zero Bigcapital application code copied.
- [x] A completely new AI agent can build the V1 core using only the `docs/` suite.
