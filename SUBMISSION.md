# HACKBACK 2026 — Submission

**Team ID:** DBG-274  
**Team:** Ctrl_alt_Delivers  
**Card:** GST-ready Accounting Ledger

**Original:** https://github.com/bigcapitalhq/bigcapital  
**Commit studied:** 4f9a2c1  
**Run:** `pnpm install && pnpm dev`

## Improvements We Built

### 1. Fix — Zero-Trust Transaction Balancing Guard + Immutable Reversal Engine

We added a financial-integrity layer that ensures every journal transaction is balanced before persistence.

- Every journal entry must satisfy:
  `total debits = total credits`
- Unbalanced transactions are rejected before database persistence.
- Financial mutations are atomic.
- Invoice voiding never deletes the original journal history.
- Voiding creates an exact reversal by swapping the original debit and credit lines.
- Repeated voiding is rejected.
- Trial Balance remains balanced after valid operations.

### 2. Differentiator — AI Accounting Copilot

We added a read-only AI Accounting Copilot grounded in the application's live accounting data.

The Copilot can answer questions about:
- invoices
- GST amounts
- CGST / SGST / IGST
- payments and outstanding amounts
- journal entries
- account balances
- Trial Balance
- accounting activity

The Copilot cannot:
- create or modify invoices
- create payments
- create journal entries
- void invoices
- modify GST
- change account balances
- execute database commands

The application must continue working without an AI API key.

## GST Support

The rebuild supports Indian GST accounting:

- Intra-state transactions → CGST + SGST
- Inter-state transactions → IGST
- GST rates including 0%, 5%, 12%, 18%, and 28%
- HSN/SAC
- GST-aware invoice reporting / GSTR-1

## Killer Tests

The rebuild is validated against the three required Killer Tests:

1. Every transaction balances: total debits equal total credits.
2. Voiding an invoice preserves the original journal and creates an exact reversal.
3. Trial Balance remains balanced after 20 random valid operations.

## Libraries / AI Used

- **Express** — HTTP server and REST API routing
- **Better-SQLite3** — synchronous, ACID-compliant relational persistence for transactions and audit ledger
- **Decimal.js** — arbitrary-precision decimal arithmetic preventing floating-point rounding errors
- **CORS** — Cross-Origin Resource Sharing middleware
- **Dotenv** — environment variable configuration management
- **TypeScript** — static typing and compilation
- **Google Gemini (gemini-1.5-flash)** — read-only Accounting Copilot, if enabled

## Documentation

The repository contains:

- `docs/OBSERVATIONS.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/API.md`
- `docs/GAPS.md`
- `docs/AGENT_LOG.md`
- `README.md`
- `SUBMISSION.md`
- `deck.pdf`

## Deck

`deck.pdf` is located in the repository root.

## Clean-Room Rebuild

This project was independently rebuilt from documented observations and requirements.

Do not state or imply that original Bigcapital source code was copied or reused.
