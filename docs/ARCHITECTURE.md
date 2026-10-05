# ARCHITECTURE.md — System Architecture: GST-Ready Accounting Ledger

This document specifies the technical architecture for the clean-room rebuild of the GST-Ready Accounting Ledger (V1).

---

## 1. Architecture Overview

The system is designed as a **deterministic, modular accounting engine** built on Node.js/TypeScript and SQLite/PostgreSQL. It prioritizes double-entry accounting integrity, ACID transactional boundaries, immutable audit logging, and automated Indian GST compliance.

Unlike Bigcapital's multi-queue asynchronous ledger commit model, our rebuild uses an **Atomic Unit-of-Work Pattern** where invoice/payment document creation, double-entry journal posting, balance recalculation, and tax allocation occur inside a single ACID database transaction.

```mermaid
graph TD
    subgraph Client Layer
        WebUI[Modern Web UI / Dashboard]
        AICopilotUI[AI Copilot Slide-over UI]
        APIClient[Automated Test Runner / API Client]
    end

    subgraph API & Routing Layer
        Router[HTTP Router / Express]
        Idempotency[Idempotency Guard]
        Validation[DTO Schema Validation]
        AICopilotRoute[POST /api/ai/copilot]
    end

    subgraph Domain Services Layer
        InvoiceSvc[Invoice Service]
        PaymentSvc[Payment Service]
        GSTEngine[GST Tax Bifurcation Engine]
        ReversalSvc[Invoice Reversal Service]
        ReportSvc[Financial Reporting Service]
        AISvc[AI Accounting Copilot Service]
    end

    subgraph Core Accounting Engine
        LedgerSvc[Ledger Transaction Service]
        InvariantGuard[Debit == Credit Invariant Validator]
        AccountBalanceSvc[Account Balance Accumulator]
    end

    subgraph Storage Layer
        DB[(Relational DB: SQLite / Postgres)]
    end

    ClientLayer --> Router
    AICopilotUI --> AICopilotRoute
    Router --> Idempotency
    Idempotency --> Validation

    Validation --> InvoiceSvc
    Validation --> PaymentSvc
    Validation --> ReversalSvc
    Validation --> ReportSvc

    AICopilotRoute --> AISvc
    AISvc -.->|STRICTLY READ-ONLY CONTEXT| InvoiceSvc
    AISvc -.->|STRICTLY READ-ONLY CONTEXT| PaymentSvc
    AISvc -.->|STRICTLY READ-ONLY CONTEXT| ReportSvc
    AISvc -.->|STRICTLY READ-ONLY CONTEXT| LedgerSvc

    InvoiceSvc --> GSTEngine
    InvoiceSvc --> LedgerSvc
    PaymentSvc --> LedgerSvc
    ReversalSvc --> LedgerSvc

    LedgerSvc --> InvariantGuard
    InvariantGuard --> AccountBalanceSvc
    AccountBalanceSvc --> DB

    ReportSvc --> DB
```

---

## 2. Components & Responsibilities

| Component | Responsibility | Inputs | Outputs |
|---|---|---|---|
| **Idempotency Guard** | Ensures network retries do not process duplicate financial transactions. | `Idempotency-Key` header | Cached response or pass-through |
| **Invoice Service** | Manages B2B invoice lifecycle (Draft, Deliver, Void); computes item totals. | Customer ID, line items, date | Saved invoice document, trigger GL |
| **GST Bifurcation Engine** | Evaluates supplier vs customer state codes and splits tax into CGST/SGST or IGST. | Supplier state, Customer state, rate | Tax breakdown: `{ cgst, sgst, igst }` |
| **Payment Service** | Captures customer payments, allocates to open invoices, relieves accounts receivable. | Customer ID, amount, deposit account | Saved payment, invoice reconciliation |
| **Invoice Reversal Service** | Executes immutable cancellations by writing contra-journal entries. | Invoice ID, reason | Reversing journal voucher, void status |
| **Ledger Transaction Service** | Core double-entry dispatcher; coordinates multi-line journal postings. | Journal entry lines `[{ accountId, debit, credit }]` | Persisted transactions |
| **Debit/Credit Invariant Validator** | Zero-trust gatekeeper verifying $\sum \text{Debit} == \sum \text{Credit}$ before DB write. | Journal entry lines | `true` or throws `UnbalancedTransactionError` |
| **Financial Reporting Service** | Aggregates general ledger entries into Trial Balance and GSTR-1 returns. | As-of date, date range | Trial Balance table, GST summary |
| **AI Accounting Copilot Service** | Translates natural language questions into read-only ledger queries and explanations. | User prompt, read-only accounting context | Grounded explanation with cited sources |

---

## 3. Communication Protocols

- **External Interface**: Synchronous HTTP/JSON REST API.
- **Wire Format**: Strict `camelCase` for JSON payloads.
- **Internal Execution**: In-process synchronous TypeScript service invocations within a single execution thread to guarantee deterministic ordering.
- **Transactional Boundary**: All operations modifying documents and general ledger lines run within an explicit `BEGIN TRANSACTION` ... `COMMIT` block.

---

## 4. State Locations

| State Entity | Location | Persistence Mechanism | Concurrency Control |
|---|---|---|---|
| **Invoices & Items** | Database Table: `invoices`, `invoice_lines` | Relational rows | Transactional lock |
| **Payments & Allocations** | Database Table: `payments`, `payment_allocations` | Relational rows | Transactional lock |
| **General Ledger** | Database Table: `journal_entries`, `journal_lines` | Relational rows (Immutable) | Append-only |
| **Account Balances** | Computed dynamically from `journal_lines` (Optionally cached in `accounts.balance`) | SQL Aggregation / `decimal(15, 4)` | Atomic SQL delta update |
| **Idempotency Records** | Database Table: `idempotency_keys` | Relational rows with TTL | Unique key constraint |

---

## 5. Core Accounting Engine Workflows

### A. Invoice Posting & GST Bifurcation Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Merchant
    participant Svc as Invoice Service
    participant GST as GST Engine
    participant Led as Ledger Service
    participant Inv as Invariant Guard
    participant DB as Relational Database

    User->>Svc: createAndDeliverInvoice(payload)
    activate Svc
    Note over Svc: Starts ACID DB Transaction
    Svc->>GST: calculateTaxes(supplierState, customerState, lines)
    alt Intra-State (State 27 == State 27)
        GST-->>Svc: Dual Split: CGST 9% (₹900) + SGST 9% (₹900)
    else Inter-State (State 27 != State 24)
        GST-->>Svc: Full Tax: IGST 18% (₹1,800)
    end

    Svc->>Led: postInvoiceGL(invoice, taxBreakdown)
    activate Led
    Note over Led: Assembles Balanced Double-Entry Lines:
    Note over Led: DR: Accounts Receivable (₹11,800)
    Note over Led: CR: Sales Income (₹10,000)
    Note over Led: CR: Output CGST (₹900)
    Note over Led: CR: Output SGST (₹900)

    Led->>Inv: validateBalance(lines)
    alt Sum(Debit) == Sum(Credit)
        Inv-->>Led: Validated (0.00 difference)
    else Sum(Debit) != Sum(Credit)
        Inv-->>Svc: Abort: Throw UnbalancedTransactionError
        Note over Svc: Rollback DB Transaction
    end

    Led->>DB: INSERT into journal_entries & journal_lines
    Led->>DB: INSERT into invoices & invoice_lines
    Note over Svc: Commits ACID DB Transaction
    Svc-->>User: 201 Created (Invoice Delivered & GL Posted)
    deactivate Led
    deactivate Svc
```

---

### B. Payment Settlement Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Cashier / Merchant
    participant Svc as Payment Service
    participant Led as Ledger Service
    participant Inv as Invariant Guard
    participant DB as Relational Database

    User->>Svc: recordPayment(customerId, amount, depositAccountId, allocations)
    activate Svc
    Note over Svc: Starts ACID DB Transaction
    Svc->>Led: postPaymentGL(depositAccountId, amount)
    activate Led
    Note over Led: Assembles Balanced Double-Entry Lines:
    Note over Led: DR: Cash / Bank Account (₹11,800)
    Note over Led: CR: Accounts Receivable (₹11,800)

    Led->>Inv: validateBalance(lines)
    Inv-->>Led: Validated (0.00 difference)

    Led->>DB: INSERT into journal_entries & journal_lines
    Svc->>DB: INSERT into payments & payment_allocations
    Svc->>DB: UPDATE invoices SET paid_amount += payment, due_amount -= payment
    Note over Svc: Commits ACID DB Transaction
    Svc-->>User: 201 Created (Payment Recorded & Invoices Relieved)
    deactivate Led
    deactivate Svc
```

---

### C. Immutable Reversal Flow (Killer Test 2)

```mermaid
sequenceDiagram
    autonumber
    actor User as Merchant
    participant Svc as Invoice Reversal Service
    participant Led as Ledger Service
    participant DB as Relational Database

    User->>Svc: voidInvoice(invoiceId, reason)
    activate Svc
    Note over Svc: Starts ACID DB Transaction
    Svc->>DB: SELECT * FROM journal_lines WHERE reference_id = invoiceId
    DB-->>Svc: Original Lines (DR: AR ₹11,800, CR: Sales ₹10,000, CR: Taxes ₹1,800)

    Svc->>Led: createReversalVoucher(originalLines, reason)
    activate Led
    Note over Led: Creates Explicit Contra-Entries (Swapping Debits & Credits):
    Note over Led: DR: Output CGST (₹900)
    Note over Led: DR: Output SGST (₹900)
    Note over Led: DR: Sales Income (₹10,000)
    Note over Led: CR: Accounts Receivable (₹11,800)
    Note over Led: Notice: Original lines are NEVER deleted!

    Led->>DB: INSERT into journal_entries (type = 'REVERSAL') & journal_lines
    Svc->>DB: UPDATE invoices SET status = 'VOIDED', due_amount = 0
    Note over Svc: Commits ACID DB Transaction
    Svc-->>User: 200 OK (Invoice Voided, Audit Trail Preserved)
    deactivate Led
    deactivate Svc
```

---

### D. Trial Balance Reporting Pipeline (Killer Tests 1 & 3)

```mermaid
sequenceDiagram
    autonumber
    actor Auditor as Auditor / Merchant
    participant Svc as Reporting Service
    participant DB as Relational Database

    Auditor->>Svc: getTrialBalance(toDate)
    activate Svc
    Svc->>DB: SELECT account_id, SUM(debit) as total_debit, SUM(credit) as total_credit FROM journal_lines WHERE entry_date <= :toDate GROUP BY account_id
    DB-->>Svc: Aggregated rows per account
    Note over Svc: Calculates Global Summary Row:
    Note over Svc: Grand Total Debit = SUM(total_debit)
    Note over Svc: Grand Total Credit = SUM(total_credit)
    Note over Svc: Asserts Grand Total Debit == Grand Total Credit
    Svc-->>Auditor: 200 OK { accounts: [...], totalDebit, totalCredit, isBalanced: true }
    deactivate Svc
```

---

## 6. GST Tax Rules & Behavior

1. **State Code Basis**:
   - The organization has a home State Code (e.g. `27` - Maharashtra).
   - Customers have a State Code derived from their GSTIN or address.
2. **Place of Supply Rule**:
   - `Customer.stateCode === Organization.stateCode` $\to$ **Intra-State**: Tax rate (e.g. 18%) is split exactly 50/50 into **CGST (9%)** and **SGST (9%)**.
   - `Customer.stateCode !== Organization.stateCode` $\to$ **Inter-State**: Full tax rate (18%) is allocated to **IGST**.
3. **Statutory Accounts**:
   - `Output CGST Payable` (Current Liability)
   - `Output SGST Payable` (Current Liability)
   - `Output IGST Payable` (Current Liability)
4. **HSN Categorization**:
   - Each invoice line mandates an HSN code (e.g., `8471` for computers, `9983` for IT services), aggregated in the GSTR-1 summary.

---

## 7. Integrity Rules & Killer Test Enforcement

| Killer Test | Architectural Mechanism | Implementation Guarantee |
|---|---|---|
| **Killer Test 1 (Transaction Balancing)** | `Debit/Credit Invariant Validator` executes inside the synchronous transaction loop. | Throws `UnbalancedTransactionError` before SQL insert if $\lvert \sum \text{Debit} - \sum \text{Credit} \rvert \ge 0.0001$. Zero unbalanced rows can enter the database. |
| **Killer Test 2 (Invoice Voiding Reversal)** | Reversal Engine writes append-only contra-entries; SQL `DELETE` is prohibited on `journal_lines`. | The original rows remain intact with their primary keys; new reversal rows balance the net account deltas to zero while maintaining an immutable audit log. |
| **Killer Test 3 (Trial Balance Equilibrium)** | Relational grouping query `SELECT SUM(debit), SUM(credit) ... GROUP BY account_id`. | Mathematical induction: If starting balance is 0 and every operation adds $\Delta \text{Debit} \equiv \Delta \text{Credit}$, the global sum across 20 random operations remains strictly balanced. |

---

## 8. AI Accounting Copilot Architecture & Read-Only Invariant

### 1. Data Flow

```text
Frontend
   ↓
AI Copilot UI
   ↓
POST /api/ai/copilot
   ↓
AI Service
   ↓
Read-only Accounting Data / Reporting Services
   ↓
Invoices / Payments / Journal / GST / Trial Balance
```

### 2. Critical Rule: Strict Read-Only Boundary
> **The AI must NEVER directly modify accounting data.**

The AI Copilot operates purely as an advisory and explanatory agent. Under NO circumstances may the AI:
- Create journal entries or vouchers.
- Modify or create sales invoices.
- Record or modify payments.
- Change GST rates, tax split calculations, or ledger amounts.
- Delete accounting records.
- Bypass user authorization or authentication guards.
- Bypass double-entry accounting invariants.

The **deterministic double-entry accounting engine remains the single source of truth**.

### 3. Environment Variables
The application supports an optional AI integration controlled entirely via environment variables:

```env
# AI Copilot Configuration (Optional)
AI_ENABLED=false
AI_PROVIDER=gemini
AI_API_KEY=
AI_MODEL=gemini-1.5-flash
```

**Security Mandate**:
- The application **must work completely without an AI API key**.
- The API key must **never** be hardcoded, saved to Git, or exposed to the frontend client.

### 4. AI Testing Specification
The test suite includes 4 specific AI verification tests:

- **AI Test 1 — AI Configured & Grounded Answer**:
  `Question → AI Service → Real Accounting Service Query → Grounded Answer with Source Documents`
- **AI Test 2 — AI Disabled / No Key**:
  `AI_ENABLED=false → Application boots and functions 100% normally → Invoices, payments, GL, reports completely unaffected`
- **AI Test 3 — Read-Only Invariant Enforcement**:
  `Prompt requesting mutation (e.g. "Create a ₹5,000 payment") → Service detects mutation intent → Rejects command → Zero DB writes`
- **AI Test 4 — Provider Failure Resilience**:
  `AI provider endpoint unavailable/timeout → Controlled fallback response ("Copilot temporarily unavailable") → Accounting system remains operational`

---

## 9. Implementation & Testing Order (Killer Tests First!)

The engineering team must adhere strictly to the following implementation order:

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

