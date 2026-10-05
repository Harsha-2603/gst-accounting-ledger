# GAPS.md — Gap Analysis & Core Product Improvements

This document catalogs evidence-backed technical gaps identified in Bigcapital and specifies the two mandatory improvements selected for the V1 rebuild:

| Improvement | Purpose |
|---|---|
| **Fix 1** | Zero-Trust Transaction Balancing Guard & Immutable Reversal Engine |
| **Differentiator 2** | AI Accounting Copilot |

> **Mandate on Indian GST**: Indian GST CGST/SGST dual-split and GSTR-1 functionality are retained as **core MUST accounting engine requirements**, not the Differentiator. The Differentiator is an AI Accounting Copilot that helps the shop owner understand invoices, payments, ledger entries, GST amounts, and financial reports.

---

## 1. Gap Analysis Matrix

| ID | Type | Problem in Bigcapital | Exact Evidence | Affected User | Severity | Proposed Resolution in V1 Rebuild |
|---|---|---|---|---|---|---|
| **GAP-01** | **Accounting Integrity** | **Absence of Debit/Credit Invariant Validator**<br>`LedgerEntriesStorageService` pushes journal entries to database insert queues without validating that $\sum \text{Debit} == \sum \text{Credit}$. Unbalanced automated entries enter the ledger unchecked. | `packages/server/src/modules/Ledger/LedgerEntriesStorage.service.ts:35-43` [Confirmed] | Accountants, business owners; corrupts Trial Balance. | **CRITICAL** | Implement pre-commit validation in `LedgerService` throwing `UnbalancedTransactionError` if $\lvert \sum \text{Debit} - \sum \text{Credit} \rvert \ge 0.0001$. |
| **GAP-02** | **GST / Tax** | **Zero Support for Indian GST Dual-Split (CGST/SGST/IGST & HSN)**<br>Bigcapital handles taxes solely as a single scalar percentage (`items_entries.tax_rate`), and dumps all tax collected into a single generic `taxPayableAccountId`. It cannot split taxes into CGST (50%) and SGST (50%), cannot handle inter-state IGST, and lacks HSN codes. | `packages/server/src/modules/SaleInvoices/ledger/InvoiceGL.ts:132-145` [Confirmed] | Indian wholesale traders; legally prevents tax invoicing and GST return filing. | **CRITICAL** | Implement state-code Place of Supply engine, HSN cataloging, and dual-split posting to `Output CGST Payable` and `Output SGST Payable`. |
| **GAP-03** | **Data Integrity / Audit** | **Destruction of Financial Audit Trail via Physical Deletion on Reversal**<br>When an invoice is deleted or voided, `LedgerStorageService` executes SQL `DELETE FROM accounts_transactions WHERE id IN (...)`. Physical deletion destroys historical journal entries, violating accounting standards and statutory electronic record rules. | `packages/server/src/modules/Ledger/LedgerStorage.service.ts:80-90` [Confirmed] | Auditors, tax authorities, management; makes financial forensic audits impossible. | **HIGH** | Replace physical SQL `DELETE` with explicit, append-only reversing journal entries with `entry_type = 'REVERSAL'`. |
| **GAP-04** | **Correctness** | **Discount Expense Normal Balance Inversion**<br>In `InvoiceGL.ts`, customer discount entries are created with `debit: discountAmountLocal` but marked `accountNormal: AccountNormal.CREDIT`. Because `Ledger.ts` calculates `closingBalance += entry.credit - entry.debit` for credit accounts, discounts *decrease* the discount expense account balance instead of increasing it. | `packages/server/src/modules/SaleInvoices/ledger/InvoiceGL.ts:151-160` [Confirmed] and `packages/server/src/modules/Ledger/Ledger.ts:136-142` [Confirmed] | Finance managers; distorts expense tracking and understates P&L operating expenses. | **HIGH** | Set `accountNormal: AccountNormal.DEBIT` on discount expense ledger entries. |
| **GAP-05** | **Data Integrity** | **Decimal Precision Mismatch Between Ledger and Balances**<br>`accounts_transactions` stores monetary values as `decimal(13, 3)`, while `accounts.amount` stores balances as `decimal(15, 5)`. Accumulation of multi-currency conversions and fractional rates causes account balances to drift from transaction line sums. | `20200104232647_create_accounts_transactions_table.ts:5-6` [Confirmed] vs `20190822214303_create_accounts_table.ts:18` [Confirmed] | Finance teams during reconciliation; creates drift between Trial Balance and Balance Sheet. | **HIGH** | Standardize precision across all financial tables to `DECIMAL(15, 4)`. |
| **GAP-06** | **Accounting Integrity** | **Orphaned Revenue When Invoice is Moved from Delivered to Draft**<br>When an edited invoice has its `deliveredAt` cleared, `InvoiceGLEntriesSubscriber.ts` checks `if (!saleInvoice.deliveredAt) return null;` and exits. The previously posted journal entries remain active in `accounts_transactions`, leaving phantom revenue on the ledger. | `packages/server/src/modules/SaleInvoices/subscribers/InvoiceGLEntriesSubscriber.ts:43-50` [Confirmed] | Management and auditors; overstates sales income and receivables. | **HIGH** | Explicitly call `revertInvoiceGLEntries()` whenever an invoice transitions from delivered to draft. |
| **GAP-07** | **Duplicate Operations** | **Zero Idempotency Control on Invoices and Payments**<br>Neither `CreatePaymentReceive.controller.ts` nor `CreateSaleInvoice.controller.ts` supports `Idempotency-Key` headers or request deduplication. Network retries cause duplicate payments and duplicate cash debits. | Inspected across `packages/server/src/modules/PaymentReceived/` and `SaleInvoices/` [Confirmed] | Cashiers and customers; causes double-billing and phantom cash deposits. | **HIGH** | Implement `IdempotencyMiddleware` tracking unique request tokens. |
| **GAP-08** | **Error Handling** | **Non-Transactional Multi-Queue Commit Vulnerability**<br>In `LedgerStorageService.commit()`, if the optional `trx` parameter is omitted, `saveEntries`, `saveAccountsBalance`, and `saveContactsBalance` execute concurrently via `Promise.all` without an overarching SQL transaction. A database crash during balance updates leaves transactions committed with corrupt account totals. | `packages/server/src/modules/Ledger/LedgerStorage.service.ts:41-51` [Confirmed] | System administrators; causes partial unrecoverable database corruption. | **HIGH** | Mandate an explicit transaction wrapper for all ledger mutations. |
| **GAP-09** | **UX / Reporting Consistency** | **Misleading Accounting Basis in Trial Balance UI**<br>`TrialBalanceSheetTable.tsx` hardcodes `basis={'cash'}` in the view header, but `TrialBalanceSheetRepository.ts` executes an aggregation across all transactions regardless of cash settlement (pure accrual). | `packages/webapp/src/containers/FinancialStatements/TrialBalanceSheet/TrialBalanceSheetTable.tsx:35` [Confirmed] vs `TrialBalanceSheetRepository.ts:87-100` [Confirmed] | Business owners relying on cash-flow statements for tax and dividend decisions. | **MEDIUM** | Dynamically display the actual basis (Accrual) matching the SQL query. |
| **GAP-10** | **Race Condition** | **Unprotected Concurrent Parent Account Balance Updates**<br>`LedgetAccountStorage.service.ts` updates dependent and parent account balances concurrently using `async.queue(..., 10)`. There is no optimistic locking (no `version` check) or pessimistic locking (`FOR UPDATE`), risking lost updates under high concurrency. | `packages/server/src/modules/Ledger/LedgetAccountStorage.service.ts:74-89` [Confirmed] | High-volume merchants; causes parent account balances to diverge from leaf nodes. | **MEDIUM** | Implement row-level locking or atomic SQL delta updates (`balance = balance + :change`). |
| **GAP-11** | **Client / Server Trust** | **Unvalidated Line Item Pricing on Invoice Creation**<br>`ItemEntryDto` accepts the unit `rate` directly from the client without comparing it against `item.sellPrice` or checking user authorization for discretionary discounting. | `packages/server/src/modules/TransactionItemEntry/dto/ItemEntry.dto.ts:40-47` [Confirmed] | Business owners; enables cashier fraud or unauthorized price dumping. | **MEDIUM** | Enforce server-side price validation against master catalog items or mandate authorization for rate overrides. |
| **GAP-12** | **Documentation Drift** | **Phantom Service Documentation (MongoDB Ghost in CONTRIBUTING.md)**<br>`CONTRIBUTING.md` instructs developers to verify setup via `docker-compose ps` showing `bigcapital-mongo` on port 27017, but MongoDB is not present in the runtime dependencies. | `CONTRIBUTING.md:66` [Confirmed] vs `docker-compose.yml:1-85` [Confirmed] | Developers onboarding or setting up local dev environments. | **LOW** | Remove stale MongoDB documentation. |

---

## 2. Selected Improvement 1 — FIX

### Title: Zero-Trust Transaction Balancing Guard & Immutable Reversal Engine

#### 1. Original Behavior
- **Blind Commit**: In `LedgerEntriesStorageService.ts:35-43`, ledger entries are pushed to a database insert queue without validating that $\sum \text{Debit} == \sum \text{Credit}$.
- **Destructive Deletion**: In `LedgerStorage.service.ts:80-90`, voiding an invoice executes `DELETE FROM accounts_transactions WHERE id IN (...)`, physically erasing historical journal lines.

#### 2. Evidence
- `packages/server/src/modules/Ledger/LedgerEntriesStorage.service.ts:35-43` [Confirmed]
- `packages/server/src/modules/Ledger/LedgerStorage.service.ts:80-90` [Confirmed]

#### 3. Problem
In double-entry accounting, transactions must strictly balance to zero ($\sum \text{Debit} - \sum \text{Credit} = 0$). Any discrepancy corrupts financial reporting across the Trial Balance, Balance Sheet, and P&L. Furthermore, physically deleting past journal entries on cancellation violates statutory audit rules and Indian Companies Act Section 128 (requiring immutable electronic records).

#### 4. New Proposed Behavior
1. **Pre-Commit Invariant Enforcement (Killer Test 1)**:
   Every transaction payload must pass an invariant assertion before writing to the database:
   $$\Delta = \left\lvert \sum \text{Debit} - \sum \text{Credit} \right\rvert < 0.0001$$
   If $\Delta \ge 0.0001$, the transaction is aborted with HTTP 422 (`UnbalancedTransactionException`), writing 0 rows.
2. **Immutable Reversal Protocol (Killer Test 2)**:
   Voiding an invoice never deletes rows from `journal_lines`. Instead, it generates an explicit **Reversing Journal Voucher** (`entry_type = 'REVERSAL'`) with lines swapping original debits and credits, timestamped with the cancellation date and referencing the original voucher.

#### 5. Acceptance Criterion
- **Given** an invoice or manual journal with unequal debits and credits, **When** committed, **Then** it rejects with HTTP 422 and writes zero rows to the ledger.
- **Given** a delivered invoice `INV-001` with 3 journal lines in `journal_lines`, **When** `POST /api/invoices/INV-001/void` is called, **Then** the original 3 rows remain intact, 3 new reversing rows are inserted, and the net customer receivable balance returns to zero.

---

## 3. Selected Improvement 2 — DIFFERENTIATOR

### Title: AI Accounting Copilot (Natural-Language Financial Intelligence)

> **Note on Core GST Scope**: Indian GST Dual-Split (50/50 CGST & SGST) and GSTR-1 reporting are classified as **core MUST requirements** of the accounting engine, not the Differentiator. The Differentiator is an AI Accounting Copilot grounded directly in the shop owner's real ledger data.

#### 1. User Problem
Wholesale shop owners and small business managers in India are typically not trained accountants. When reviewing their books, they struggle with questions such as:
- *"Why is this invoice amount ₹11,800?"*
- *"How much CGST and SGST did I collect?"*
- *"Show me today's unpaid invoices."*
- *"Explain this journal entry."*
- *"Does my trial balance currently balance?"*
- *"Summarize this month's sales and payments."*

Existing accounting software (including Bigcapital) presents raw tables of numbers, debit/credit jargon, and static reports. Finding answers requires manual filtering, cross-referencing multiple screens, or hiring an outside auditor.

#### 2. Why the Original Does Not Provide It
Bigcapital has zero artificial intelligence or natural-language querying capabilities. All reporting is static SQL aggregation requiring the user to know accounting concepts, account codes, and filter parameters.

#### 3. Proposed Behavior
1. **Interactive Copilot Interface**: A responsive slide-over drawer and quick-query bar integrated into the web frontend (`POST /api/ai/copilot`).
2. **Context-Grounded Financial Intelligence**:
   - The Copilot translates the user's natural language question into read-only domain service queries against live application records (Invoices, Invoice Lines, Payments, Journal Entries, GST calculations, and Trial Balance).
   - Generates concise, accurate explanations citing the exact source documents (`sources: ["invoice:INV-0001", "gst_split", "accounts_transactions"]`).
3. **Strict Read-Only Invariant (CRITICAL ARCHITECTURAL RULE)**:
   > **The AI must NEVER directly modify accounting data.**
   - The AI cannot create journal entries.
   - The AI cannot modify or create invoices.
   - The AI cannot record or modify payments.
   - The AI cannot change GST rates or tax values.
   - The AI cannot delete any accounting records.
   - The AI cannot bypass user authorization or accounting validation.
   - The **deterministic double-entry accounting engine remains the sole source of truth**.

#### 4. Acceptance Criteria
- **Scenario 1 (Grounded Answer)**:
  - **Given** an existing invoice `INV-0001` of ₹10,000 taxable value with ₹900 CGST and ₹900 SGST,
  - **When** the user asks: *"Why is invoice INV-0001 amount ₹11,800?"*,
  - **Then** the Copilot explains that ₹10,000 is the base item total and ₹1,800 is the 18% intra-state GST split into ₹900 CGST (9%) and ₹900 SGST (9%), citing `INV-0001`.
- **Scenario 2 (AI Disabled Operation)**:
  - **Given** `AI_ENABLED=false` or no API key configured,
  - **When** the user loads the app or interacts with invoices, payments, and trial balance,
  - **Then** the application operates 100% normally without crashes or warnings.
- **Scenario 3 (Provider Failure Fallback)**:
  - **Given** the AI provider endpoint is unreachable or times out,
  - **When** a user submits a query to the Copilot,
  - **Then** the API returns a controlled fallback message (`"AI Copilot is temporarily unavailable. Your accounting records are completely safe."`), and the accounting system remains fully functional.
- **Scenario 4 (Mutation Prevention)**:
  - **Given** any prompt asking the AI to *"Add a ₹5,000 payment"* or *"Change invoice tax to 5%"*,
  - **When** processed by the Copilot service,
  - **Then** the service rejects the command, informing the user that the Copilot is strictly read-only and mutations must be executed through the standard accounting forms.

#### 5. Demo Scenario
1. In the web dashboard, click the **AI Copilot** action button.
2. Ask: *"How much CGST and SGST did I collect today?"*
3. The Copilot queries the `Output CGST Payable` and `Output SGST Payable` balances and replies: *"Today you collected ₹900 in CGST and ₹900 in SGST from 1 invoice (INV-0001). Total GST collected: ₹1,800."*
4. Ask: *"Does my trial balance balance right now?"*
5. The Copilot queries the live Trial Balance service and confirms: *"Yes, your trial balance is perfectly balanced. Total Debits: ₹11,800.00 equal Total Credits: ₹11,800.00 (Difference: ₹0.00)."*

#### 6. Why It Makes Our Version Better
It pairs a mathematically rigorous, zero-trust GST double-entry engine with natural-language accessibility, allowing shop owners with zero accounting background to understand their business finances instantly without compromising ledger integrity.

