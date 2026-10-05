# PRD.md — Product Requirements Document: GST-Ready Accounting Ledger

---

## 1. Product Statement

For **Indian wholesale trade shop owners and accountants** who **struggle with manual, error-prone GST tax calculations, unbalanced ledgers, destroyed audit trails when voiding sales, and confusing financial reports**, the **GST-Ready Accounting Ledger (Rebuild V1)** does **automated dual-split GST accounting (CGST/SGST/IGST), double-entry transaction balancing enforcement, immutable audit-compliant invoice reversals, real-time Trial Balance verification, and an intelligent read-only AI Accounting Copilot**, unlike **generic accounting software like Bigcapital that treats tax as a single flat percentage, erases ledger rows on cancellation, and offers zero natural-language financial intelligence**.

---

## 2. User

The target user is the **Wholesale Shop Owner / Accounts Manager** in India:
- Conducts high-frequency B2B wholesale transactions of goods and services.
- Sells to both intra-state customers (within the same state, requiring 50/50 CGST + SGST split) and inter-state customers (outside the state, requiring IGST).
- Must assign statutory HSN/SAC codes to every product line.
- Files monthly statutory returns (GSTR-1 and GSTR-3B) with the Goods and Services Tax Network (GSTN).
- Requires strict double-entry ledger integrity to ensure books balance to the rupee for tax audits and statutory compliance under the Indian Companies Act.

---

## 3. Problem

1. **Absence of Native Indian GST Dual-Split**: Conventional international accounting software (like Bigcapital) supports only a single scalar tax rate. When issuing an 18% GST invoice, it dumps the entire tax into a single liability bucket. The merchant must manually compute and hand-post 9% CGST and 9% SGST journal entries to avoid statutory tax penalties.
2. **Fragile Ledger Balance Invariants**: Systems allow automated services to commit unbalanced transactions without pre-commit mathematical validation ($\sum \text{Debit} \neq \sum \text{Credit}$), leading to corrupt Trial Balances during rounding or multi-currency operations.
3. **Audit Trail Destruction on Reversals**: Cancelling or voiding an invoice typically executes a physical SQL `DELETE` on journal transactions, erasing historical accounting footprints and violating statutory electronic record-keeping laws.
4. **Disjointed Settlement & Payment Tracking**: Collecting customer payments across partial or multiple invoices lacks transactional locking, causing over-crediting or lost updates during simultaneous cash-counter entries.

---

## 4. Core Goal

Enable a wholesale merchant to quickly generate a GST-compliant sales invoice, deliver it to post balanced double-entry ledger lines, collect and reconcile customer payments, maintain an immutable audit trail upon cancellation, and instantly verify total ledger equilibrium ($\sum \text{Debit} == \sum \text{Credit}$) via the Trial Balance.

---

## 5. Core Flow

The shortest operational path to the user's goal:

```
[Create Customer & Items (with HSN & State)]
                     ↓
[Draft & Issue Sales Invoice]
                     ↓
[Deliver Invoice] ──> Posts Double-Entry GL (DR: AR, CR: Sales, CR: CGST, CR: SGST)
                     ↓
[Record Customer Payment] ──> Posts Double-Entry GL (DR: Cash/Bank, CR: AR)
                     ↓
[Verify Trial Balance] ──> Proves Equilibrium (Total Debits == Total Credits)
                     ↓
(Optional Exception Flow: Void Invoice)
                     ──> Posts Balanced Immutable Reversal Entries (Audit Trail Preserved)
```

---

## 6. Hard Core Components

The Hard Core of V1 consists strictly of four mission-critical subsystems:
1. **Sales Invoices**: B2B invoice generation with state-aware Place of Supply, item lines with HSN codes, and automatic tax bifurcation.
2. **Payments Received**: Customer remittance capture, payment method allocation (Cash/Bank), and invoice debt relief.
3. **Journal Entries (General Ledger)**: Atomic double-entry transaction engine enforcing mathematical conservation of debits and credits.
4. **Financial Reports (Trial Balance)**: Real-time SQL aggregation proving that general ledger debit balances equal credit balances across all active accounts.

---

## 7. Killer Tests

V1 implementation is certified against three non-negotiable Killer Tests:

### Killer Test 1: Transaction Debit/Credit Invariant
- **Rule**: Every single transaction committed to the ledger must have $\sum \text{Debits} == \sum \text{Credits}$.
- **Invariant**: Any write where $\lvert \sum \text{Debit} - \sum \text{Credit} \rvert \ge 0.0001$ must be rejected before touching the database.

### Killer Test 2: Invoice Voiding Reversal Invariant
- **Rule**: Voiding an invoice must cleanly neutralize its accounting effect without deleting historical journal rows.
- **Invariant**: Original journal lines remain in the ledger; explicit reversing contra-entries are posted; net customer AR and tax liability return to pre-invoice balances.

### Killer Test 3: Random Operations Trial Balance Invariant
- **Rule**: The Trial Balance must remain balanced after 20 arbitrary, consecutive accounting operations.
- **Invariant**: Across any combination of invoice creations, partial payments, full payments, and invoice voids, $\sum \text{Debit} - \sum \text{Credit} \equiv 0$ on the Trial Balance.

---

## 8. Features (MoSCoW)

### MUST (Mandatory for V1)
- **MUST-01: Dual-Split GST Engine**: Automatically split tax into CGST (50%) + SGST (50%) for intra-state sales, or IGST (100%) for inter-state sales based on supplier and customer state codes.
- **MUST-02: B2B Invoice Lifecycle**: Create draft invoices, calculate subtotal and taxes, and post balanced GL entries upon delivery.
- **MUST-03: Zero-Trust Transaction Balancing Guard**: Reject any transaction where $\sum \text{Debit} \neq \sum \text{Credit}$ with HTTP 422 before persistence.
- **MUST-04: Customer Payment Settlement**: Capture remittances, deposit into Cash or Bank accounts, and credit Accounts Receivable while decrementing invoice due amounts.
- **MUST-05: Immutable Invoice Reversal**: Void an invoice by appending reversing journal entries while preserving original transaction history.
- **MUST-06: Live Trial Balance Sheet**: Query and display account-level debit/credit totals and a summary row demonstrating global balance.
- **MUST-07: Chart of Accounts Seed**: Seed default accounts (Accounts Receivable, Cash on Hand, Bank Checking, Sales Income, Output CGST Payable, Output SGST Payable, Output IGST Payable).

### SHOULD (High Value)
- **SHOULD-01: Live GSTR-1 B2B Summary Report**: Aggregate invoice tax lines by customer GSTIN and HSN code for statutory filing.
- **SHOULD-02: Idempotency Protection**: Support `Idempotency-Key` headers on invoice and payment endpoints to prevent duplicate cash postings from network retries.
- **SHOULD-03: Multi-Line Partial Payment Allocation**: Allow a single lump-sum payment to be split across multiple open invoices.
- **SHOULD-04: AI Accounting Copilot (Differentiator)**: Slide-over natural-language assistant answering questions about invoices, payments, journal vouchers, GST amounts, and trial balance status grounded strictly in live read-only accounting records.

### COULD (Nice to Have)
- **COULD-01: Printable Tax Invoice PDF**: Generate a clean printable invoice layout with tax split breakdown and HSN summary.
- **COULD-02: Customer Ledger Statement**: View running transactional debits, credits, and balance for a specific customer.

### WON'T (Out of Scope for V1)
- Multi-currency conversions and foreign exchange gain/loss calculations.
- Inventory tracking, warehouse management, FIFO/LIFO costing, and purchase orders.
- Fixed asset depreciation schedules.
- Bank feed reconciliation via Plaid/Yodlee.
- Payroll and employee expense claims.
- Recurring automated billing subscriptions.

---

## 9. Acceptance Criteria (Given / When / Then)

### Scenario 1: Killer Test 1 — Transaction Balancing Invariant
- **Given** an accounting transaction payload where total debits equal ₹1,180.00 and total credits equal ₹1,000.00.
- **When** the ledger commit service attempts to persist the transaction.
- **Then** the service must reject the write, throw an `UnbalancedTransactionException`, write 0 rows to the database, and return HTTP 422.

### Scenario 2: Killer Test 2 — Immutable Invoice Reversal
- **Given** an active delivered invoice `INV-001` of ₹11,800.00 with 3 journal lines in the ledger (AR DR ₹11,800, Sales CR ₹10,000, CGST CR ₹900, SGST CR ₹900).
- **When** the user calls `POST /api/invoices/INV-001/void`.
- **Then** the original 3 journal lines remain untouched in the database, 3 new reversing lines are inserted (AR CR ₹11,800, Sales DR ₹10,000, CGST DR ₹900, SGST DR ₹900), the invoice status transitions to `VOIDED`, and customer due balance returns to ₹0.00.

### Scenario 3: Killer Test 3 — Trial Balance After 20 Random Operations
- **Given** an initialized ledger with starting balances of ₹0.00.
- **When** a test script executes 20 random operations (a mix of intra-state invoices, inter-state invoices, partial payments, full payments, and invoice voids).
- **Then** `GET /api/reports/trial-balance` must return `totalDebit == totalCredit` down to the exact paisa (0.00).

### Scenario 4: Automated Intra-State GST Dual-Split (Core MUST)
- **Given** an organization in Maharashtra (`stateCode: "27"`) and a customer in Maharashtra (`stateCode: "27"`).
- **When** an invoice is delivered with 1 item of taxable value ₹10,000.00 at 18% GST.
- **Then** the general ledger must post exactly:
  - Debit: `Accounts Receivable` = ₹11,800.00
  - Credit: `Sales Income` = ₹10,000.00
  - Credit: `Output CGST Payable` = ₹900.00 (9%)
  - Credit: `Output SGST Payable` = ₹900.00 (9%)
  - And ₹0.00 to `Output IGST Payable`.

### Scenario 5: Automated Inter-State GST (IGST) (Core MUST)
- **Given** an organization in Maharashtra (`stateCode: "27"`) and a customer in Gujarat (`stateCode: "24"`).
- **When** an invoice is delivered with 1 item of taxable value ₹10,000.00 at 18% GST.
- **Then** the general ledger must post:
  - Debit: `Accounts Receivable` = ₹11,800.00
  - Credit: `Sales Income` = ₹10,000.00
  - Credit: `Output IGST Payable` = ₹1,800.00 (18%)
  - And ₹0.00 to CGST and SGST accounts.

### Scenario 6: AI Accounting Copilot — Grounded Answer
- **Given** the user has accounting data with invoice `INV-001` (Taxable ₹10,000, CGST ₹900, SGST ₹900, Total ₹11,800).
- **When** the user asks: *"Why is invoice INV-001 amount ₹11,800?"*.
- **Then** the Copilot explains the invoice total using the actual stored invoice, GST split, and accounting records, citing `INV-0001` as a source.

### Scenario 7: AI Disabled / No Key Configuration
- **Given** `AI_ENABLED=false` or no API key is configured.
- **When** the user opens and uses the application.
- **Then** the accounting application continues to work 100% normally across all invoice, payment, GST, and reporting workflows.

### Scenario 8: AI Provider Failure Fallback
- **Given** the configured AI provider endpoint is down or times out.
- **When** the user submits a Copilot request.
- **Then** the application displays a graceful fallback message (`"AI Copilot is temporarily unavailable. Your accounting records are safe."`), and core accounting functionality remains completely operational.

### Scenario 9: AI Read-Only Invariant Enforcement
- **Given** any prompt attempting to instruct the Copilot to alter financial records (e.g. *"Delete invoice INV-001"* or *"Record payment ₹10,000"*).
- **When** submitted to `POST /api/ai/copilot`.
- **Then** the service rejects the mutation request, performs 0 database writes, and instructs the user to use the verified accounting forms.

---

## 10. Improvements Referenced from GAPS.md

1. **IMPROVEMENT 1 — FIX (Ledger Invariant & Immutable Reversal Engine)**: Corrects Bigcapital's blind insertion in `LedgerEntriesStorageService.ts:35-43` and physical deletion in `LedgerStorage.service.ts:80-90`. Enforces pre-commit balancing validation and preserves audit history via reversing entries.
2. **IMPROVEMENT 2 — DIFFERENTIATOR (AI Accounting Copilot)**: A genuinely new capability providing natural-language financial intelligence grounded strictly in the shop owner's live read-only accounting records. (Note: Indian GST Dual-Split and GSTR-1 reporting remain core MUST features of the engine).

---

## 11. Implementation & Testing Order (Killer Tests First!)

To ensure the accounting core is rock-solid before any optional features are introduced, the engineering team must follow this exact order:

```text
1. Core accounting engine & Chart of Accounts seed
2. Killer Test 1: Every transaction balances (Invariant Guard)
3. Killer Test 2: Voiding an invoice reverses its journal entries (Immutable Reversals)
4. Killer Test 3: Trial balance balances after 20 random operations
5. Fix 1 from GAPS.md (Transaction Balancing Guard & Immutable Reversal Engine)
6. Differentiator 2: AI Accounting Copilot (Read-Only Interface & Service)
7. AI Tests 1–4
8. Run Killer Tests 1–3 AGAIN to certify regression safety
9. Full end-to-end regression testing
10. Final submission
```

