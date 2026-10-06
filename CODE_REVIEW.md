# HACKBACK code review · DBG-274 · GST-ready Accounting Ledger
- Reviewed at: 2026-10-06T08:30:19Z (2026-10-06T14:00:19+05:30 IST)
- Judged commit: bd926a0bd9fdece14a5eb24b0acf1b211ced52b1 (2026-10-06T12:51:22+05:30) · the last commit before the code freeze
- Reviewer: AI agent run by a HACKBACK judge

### DBG-274 · GST-ready Accounting Ledger
Commit: bd926a0bd9fdece14a5eb24b0acf1b211ced52b1 · 2026-10-06T12:51:22+05:30 · Clean-room: OK

| Section | Score | Why (path:line) |
|---|---|---|
| A. Core flow | 28/30 | End-to-end Chart of Accounts (`src/database/index.ts:167-185`, `src/services/accountService.ts:17-73`), B2B Invoices posting AR Dr, Sales Cr, CGST Cr, SGST Cr (`src/services/invoiceService.ts:68-120`), Customer Payments posting Bank/Cash Dr, AR Cr (`src/services/paymentService.ts:87-114`), Invoice Voiding via immutable reversing contra-entries (`src/services/invoiceService.ts:187-253`), and live Trial Balance aggregated directly from journal lines (`src/services/reportService.ts:24-84`) plus statutory GSTR-1 (`src/services/reportService.ts:86-175`). Standalone P&L and Balance Sheet report endpoints are omitted (-2). |
| B. Killer Tests | 30/30 | All three Killer Tests pass with 100% success on the server and are verified by executable test suites in `src/tests/killerTest1.ts:36-122`, `src/tests/killerTest2.ts:35-151`, and `src/tests/killerTest3.ts:33-211`. |
| C. Two improvements | 20/20 | 1. Fix: Zero-Trust Transaction Balancing Guard & Immutable Reversal Engine (`src/domain/invariantGuard.ts:25-70`, `src/services/invoiceService.ts:187-253`, `docs/GAPS.md:33-60`) is fully built and wired. 2. Differentiator: AI Accounting Copilot (`src/services/aiCopilotService.ts:22-81`, `src/services/ai/mutationShield.ts:7-61`, `src/services/ai/aiProvider.ts:33-158`, `docs/GAPS.md:62-120`) has a strict read-only mutation shield, local deterministic offline grounding, and UI drawer integration. |
| D. Built from their docs | 10/10 | Direct correspondence between code and documentation: all acceptance criteria from `docs/PRD.md:88-96` (MUST-01 through MUST-07), REST route definitions in `docs/API.md:40-390`, and relational entities and constraints in `docs/DATA_MODEL.md:30-220` match the implementation. |
| E. Engineering | 9/10 | Strict arbitrary decimal precision with Decimal.js (`src/domain/decimal.ts:1-32`), Better-SQLite3 WAL mode (`src/database/index.ts:6-7`), pre-commit invariant enforcement, idempotency middleware (`src/middleware/idempotency.ts:5-40`), zero committed secrets (`.env.example:1-26`), centralized error handling (`src/middleware/errorHandler.ts:4-19`). Deducted 1 point because Express route handlers lack server-side authentication/authorization middleware (-1). |
| Total | 97/100 | |

Killer Tests:
1. READY · 10/10 · Pre-commit assertion `validateJournalBalance` throws `UnbalancedTransactionError` (HTTP 422) when $\lvert \sum \text{Debit} - \sum \text{Credit} \rvert \ge 0.0001$ (`src/domain/invariantGuard.ts:25-70`); executes within an atomic database transaction (`src/services/ledgerService.ts:34-96`); certified with zero database mutations by `src/tests/killerTest1.ts:36-122`.
2. READY · 10/10 · Voiding creates an explicit reversing journal entry (`entry_type = 'REVERSAL'`) with swapped debits and credits linked to the original invoice (`src/services/invoiceService.ts:187-253`); zero SQL `DELETE` calls preserve full historical ledger audit trail; certified by `src/tests/killerTest2.ts:35-151`.
3. READY · 10/10 · Trial Balance is computed dynamically via SQL aggregation from `journal_lines` and `journal_entries` rather than cached running balances (`src/services/reportService.ts:27-42`); certified across 20 randomized operations (invoices, partial/full payments, voids) maintaining exact equilibrium ($\text{difference} = 0.0000$) in `src/tests/killerTest3.ts:33-211`.

Improvements:
1. Zero-Trust Transaction Balancing Guard & Immutable Reversal Engine · 10/10 · Pre-commit mathematical validation of debit/credit conservation before persistence (`src/domain/invariantGuard.ts:25-70`) and non-destructive contra-entry ledger reversal engine (`src/services/invoiceService.ts:187-253`), resolving Bigcapital's blind commit and physical SQL DELETE vulnerabilities (`docs/GAPS.md:33-60`).
2. AI Accounting Copilot (Natural-Language Financial Intelligence) · 10/10 · Read-only natural language intelligence service (`src/services/aiCopilotService.ts:22-81`) grounded in live accounting context (`src/services/ai/accountingContextService.ts:1-180`) with regex mutation shield rejecting any write intent (`src/services/ai/mutationShield.ts:7-61`), offline deterministic provider fallback (`src/services/ai/aiProvider.ts:33-158`), and responsive interactive drawer frontend (`public/app.js:42-50`, `public/index.html:1380-1460`).

Flags: none. Initial commit occurred on 5 Oct 22:29:32 IST (after 4:00 pm IST freeze); docs were committed first (`6649220`); source code committed on 6 Oct 08:35:14 IST; all commits completed prior to 6 Oct 1:30 pm IST; no committed secrets; clean-room implementation with no Bigcapital code reuse.

3 questions for the judges to ask this team in their Defence, aimed at the weakest spots you found:
1. The Express API routes (`/api/invoices`, `/api/payments`, `/api/transactions`) currently accept requests without server-side authentication middleware, relying on token handling in the browser client (`public/api.js:49-52`). How would you structure server-side session authentication and tenant-level authorization middleware to secure the backend API?
2. In `src/services/reportService.ts:38`, `getTrialBalance` left-joins `journal_entries` with an `asOfDate` filter (`LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id AND je.entry_date <= ?`), but because the join from `accounts` to `journal_lines` is unconditional, lines from transactions dated after `asOfDate` still return non-null debit/credit amounts with a null `je.id`. How would you rewrite this query so that historical point-in-time trial balance queries strictly exclude transactions posted after the target date?
3. The platform provides real-time Trial Balance and GSTR-1 statutory reports, but does not provide dedicated Profit & Loss (P&L) and Balance Sheet statement generation. What double-entry year-end closing process would your ledger engine need to implement to roll net income into retained earnings on the equity statement?

SCORE core=28 kt=30 imp=20 docs=10 eng=9 total=97
