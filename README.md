# GST-Ready Accounting Ledger

The **GST-Ready Accounting Ledger** is a clean-room, double-entry accounting software platform purpose-built for Indian wholesale shop owners and accounts managers who struggle with manual, error-prone GST tax calculations, unbalanced ledgers, and destroyed financial audit trails when cancelling transactions. The product provides automated Indian GST dual-split calculations (CGST/SGST/IGST) with HSN catalog tracking, core double-entry accounting workflows spanning B2B sales invoices, customer payment remittances, immutable journal vouchers, and live trial balance verification. It incorporates a **Zero-Trust Transaction Balancing Guard and Immutable Reversal Engine** as its primary system Fix—rejecting any unbalanced transaction prior to database persistence and preserving historical audit trails via explicit contra-entries rather than destructive row deletion—and features an **AI Accounting Copilot** as its key Differentiator, delivering natural-language financial intelligence and explanations grounded strictly in live read-only accounting records without compromising double-entry ledger integrity.

---

## Features

### Core Accounting
- **Invoice**: End-to-end B2B sales invoice lifecycle (Draft, Deliver, Void) supporting line items with HSN codes, state-aware Place of Supply, automated tax computation, and atomic posting of balanced double-entry ledger lines upon delivery (`POST /api/invoices`).
- **Payment**: Customer remittance capture with deposit allocation into Cash or Bank accounts, automatic Accounts Receivable debt relief, and invoice reconciliation (`POST /api/payments`).
- **Journal Entries**: Deterministic double-entry general ledger voucher creation (`journal_entries` and `journal_lines`), enforcing debit-credit balance preservation and maintaining an immutable audit history (`GET /api/transactions`).
- **Trial Balance**: Real-time SQL aggregation of posted general ledger debit and credit balances by account, asserting global mathematical equilibrium ($\sum \text{Debit} == \sum \text{Credit}$) across all active accounts (`GET /api/reports/trial-balance`).
- **Financial Reports**: Core financial statements including the live Trial Balance sheet and statutory tax summaries.

### GST
- **Automated Dual-Split GST (Intra-State)**: Automatically splits tax into 50% Central GST (`Output CGST Payable`) and 50% State GST (`Output SGST Payable`) when supplier and customer state codes match (e.g., Maharashtra state code `27` to `27`).
- **Integrated GST (Inter-State)**: Allocates 100% of tax liability to Integrated GST (`Output IGST Payable`) when transactions cross state borders (e.g., Maharashtra `27` to Gujarat `24`).
- **Place of Supply Engine**: Evaluates organization home State Code against customer destination State Code to determine statutory tax jurisdiction.
- **HSN/SAC Code Support**: Mandates statutory Harmonized System of Nomenclature (HSN) codes per invoice line item for product-level tax tracking.
- **Statutory GSTR-1 Summary Reporting**: Aggregates delivered sales invoice tax lines into B2B tables grouped by customer GSTIN and HSN-wise summaries for statutory tax return filing (`GET /api/reports/gstr-1`).

### Fix
- **Zero-Trust Transaction Balancing Guard & Immutable Reversal Engine** (resolving GAP-01 and GAP-03 from [docs/GAPS.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/GAPS.md)):
  - **Transaction Balancing Guard (Pre-Commit Invariant)**: In Bigcapital, automated services pushed journal entries to database queues without validating mathematical equilibrium (`LedgerEntriesStorage.service.ts:35-43`). The Fix introduces a zero-trust gatekeeper that asserts $|\sum \text{Debit} - \sum \text{Credit}| < 0.0001$. Any unbalanced transaction is aborted with HTTP 422 (`UnbalancedTransactionException`), writing zero rows to the ledger.
  - **Immutable Reversal Protocol**: In Bigcapital, voiding or deleting an invoice executed a physical SQL `DELETE FROM accounts_transactions WHERE id IN (...)` (`LedgerStorage.service.ts:80-90`), permanently erasing historical journal rows and violating statutory record-keeping regulations (Indian Companies Act Section 128). The Fix replaces physical deletion with explicit, append-only reversing journal entries (`entry_type = 'REVERSAL'`) that swap original debits and credits, neutralizing account balances while preserving an immutable financial audit trail.

### Differentiator
- **AI Accounting Copilot (Natural-Language Financial Intelligence)** (documented in [docs/GAPS.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/GAPS.md) and [docs/PRD.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/PRD.md)):
  - Provides a slide-over natural-language query interface (`POST /api/ai/copilot`) enabling non-accountant shop owners to ask plain-English questions regarding invoice totals, GST breakdowns, payment statuses, and trial balance equilibrium.
  - Generates clear answers grounded strictly in live read-only accounting records, citing specific source documents (e.g., invoices, line items, and GST splits).
  - **Strict Read-Only Invariant**: The AI service operates under a non-negotiable architectural boundary—it has zero mutation authority. It cannot create or alter invoices, payments, journal entries, GST rates, or ledger balances. The deterministic double-entry accounting engine remains the single source of truth.
  - **Decoupled Configuration & Resilience**: Optional integration toggled via environment variables (`AI_ENABLED=false`). The accounting platform functions 100% normally without an AI key, and includes graceful fallback handling if the AI provider endpoint is unreachable.

---

## Architecture

The system follows a deterministic, layered architecture built on Node.js/TypeScript and SQLite/PostgreSQL, prioritizing double-entry accounting integrity, ACID transactional boundaries, immutable audit logging, and automated Indian GST compliance (see [docs/ARCHITECTURE.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/ARCHITECTURE.md)).

```text
Frontend (Modern Web UI / AI Copilot Slide-over)
   ↓
Backend/API (HTTP Router / Express with Idempotency Guard & DTO Schema Validation)
   ↓
Domain Services (Invoice, Payment, GST Bifurcation, Reversal, Financial Reporting, AI Copilot)
   ↓
Accounting Engine (Ledger Transaction Service, Invariant Validator, Account Balance Accumulator)
   ↓
Database (Relational Database: SQLite / PostgreSQL with ACID Unit-of-Work Transactions)
```

- **AI Service Boundary**: The AI Accounting Copilot is an optional, read-only domain service. It queries read-only domain and reporting services to formulate grounded explanations. It is architecturally prohibited from interacting with write paths of the Accounting Engine or Database, ensuring AI never becomes the accounting source of truth.

---

## Requirements

The project requirements are defined in [docs/PRD.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/PRD.md), including:
- **MUST-01**: Dual-Split GST Engine (50/50 CGST/SGST for intra-state; 100% IGST for inter-state).
- **MUST-02**: B2B Invoice Lifecycle (Draft, Deliver, Void with automatic GL posting on delivery).
- **MUST-03**: Zero-Trust Transaction Balancing Guard (HTTP 422 pre-commit validation).
- **MUST-04**: Customer Payment Settlement (Cash/Bank deposit and Accounts Receivable relief).
- **MUST-05**: Immutable Invoice Reversal (append-only reversing entries, zero row deletion).
- **MUST-06**: Live Trial Balance Sheet (account-level debit/credit balance verification).
- **MUST-07**: Chart of Accounts Seed (default statutory accounts).
- **SHOULD-01**: Live GSTR-1 B2B Summary Report.
- **SHOULD-02**: Idempotency Protection (`Idempotency-Key` header support).
- **SHOULD-03**: Multi-Line Partial Payment Allocation.
- **SHOULD-04**: AI Accounting Copilot (Differentiator).

### Killer Tests

The core accounting engine is certified against three non-negotiable Killer Tests:
1. **Killer Test 1: Every Transaction Balances**
   Every single transaction committed to the ledger must satisfy $\sum \text{Debit} == \sum \text{Credit}$. Any write payload with $|\sum \text{Debit} - \sum \text{Credit}| \ge 0.0001$ is rejected with HTTP 422 before touching the database.
2. **Killer Test 2: Voiding an Invoice Reverses its Journal Entries**
   Voiding an invoice cleanly neutralizes its accounting effect without deleting historical journal rows. Original journal lines remain intact, explicit reversing contra-entries (`entry_type = 'REVERSAL'`) are posted, and net customer receivables and tax liabilities return to pre-invoice balances.
3. **Killer Test 3: Trial Balance Balances After 20 Random Operations**
   The Trial Balance must remain strictly balanced after 20 arbitrary, consecutive accounting operations (any combination of intra-state invoices, inter-state invoices, partial payments, full payments, and invoice voids). $\sum \text{Debit} - \sum \text{Credit} \equiv 0.00$ down to the exact paisa.

---

## Prerequisites

Verified prerequisites based on the repository and architecture documentation:
- **Git** (version control system to clone and inspect the repository)
- **Node.js** (runtime engine target specified in [docs/ARCHITECTURE.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/ARCHITECTURE.md): Node.js/TypeScript)
- **Relational Database** (storage engine target specified in [docs/ARCHITECTURE.md](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/ARCHITECTURE.md): SQLite / PostgreSQL)

*Other runtime package managers, system containers, or background services: Not established from the available repository information (the repository currently hosts the verified clean-room specification and documentation suite in `docs/`).*

---

## Setup — How to run the rebuild in 5 commands or fewer

The setup and run sequence for the repository requires five commands or fewer:

```bash
# 1. Clone the repository
git clone https://github.com/Harsha-2603/gst-accounting-ledger.git

# 2. Enter repository directory
cd gst-accounting-ledger
```

> **Note on Build and Execution Commands**:
> Additional package installation, database migration, or server startup commands: *Not established from the available repository information.*
> The repository currently hosts the complete technical specification, data model, API contract, and architecture design suite in [docs/](file:///c:/BoxBox/HackBack/gst-accounting-ledger/docs/). Application source code manifests and executable scripts have not yet been established in the repository.
