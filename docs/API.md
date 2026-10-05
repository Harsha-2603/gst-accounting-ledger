# API.md — API Specification: GST-Ready Accounting Ledger

This document defines the complete HTTP REST API for the clean-room rebuild of the GST-Ready Accounting Ledger (V1).

---

## 1. Overview & Protocol Conventions

- **Base URL**: `/api`
- **Format**: JSON (`Content-Type: application/json`)
- **Key Casing**: Strict `camelCase` for all request and response payloads.
- **Idempotency**: All mutation endpoints (`POST`) accept an optional header `Idempotency-Key: <uuid>`.
- **Authentication**: Bearer token (`Authorization: Bearer <token>`) or Session cookie.
- **Error Format**:
  ```json
  {
    "statusCode": 400,
    "error": "BAD_REQUEST",
    "message": "Human readable error description",
    "details": []
  }
  ```

---

## 2. API Endpoints

### 1. `POST /api/invoices`
- **Purpose**: Creates and delivers a new GST-compliant sales invoice, automatically computing tax bifurcation and posting balanced double-entry ledger lines.
- **Input**:
  ```json
  {
    "customerId": "cust_123",
    "invoiceDate": "2026-10-05",
    "dueDate": "2026-11-04",
    "invoiceNumber": "INV-0001",
    "deliver": true,
    "lines": [
      {
        "itemId": "item_456",
        "description": "Dell OptiPlex 7090 Desktop",
        "hsnCode": "8471",
        "quantity": 2,
        "unitPrice": 50000.00,
        "taxRate": 18.00
      }
    ]
  }
  ```
- **Validation**:
  - `customerId`: Required, must exist in `customers`.
  - `invoiceDate`, `dueDate`: Required ISO date strings (`dueDate >= invoiceDate`).
  - `lines`: Required array, minimum 1 item.
  - `lines[].quantity`: Required, number $> 0$.
  - `lines[].unitPrice`: Required, number $\ge 0$.
  - `lines[].taxRate`: Required, must be a recognized GST slab (`0, 5, 12, 18, 28`).
- **Output (201 Created)**:
  ```json
  {
    "id": "inv_987",
    "invoiceNumber": "INV-0001",
    "status": "DELIVERED",
    "subtotal": 100000.00,
    "cgstAmount": 9000.00,
    "sgstAmount": 9000.00,
    "igstAmount": 0.00,
    "totalAmount": 118000.00,
    "dueAmount": 118000.00,
    "journalEntryId": "jv_001"
  }
  ```
- **Authentication**: Required (`Bearer JWT`).
- **Authorization**: Role `Admin` or `Accountant` (`invoice:create`).
- **Error Cases**:
  - `400 BAD_REQUEST`: Missing fields, invalid date range, negative quantities.
  - `404 NOT_FOUND`: Customer or Item ID not found.
  - `409 CONFLICT`: Duplicate `invoiceNumber`.
  - `422 UNPROCESSABLE_ENTITY`: Double-entry balancing invariant violation ($\sum \text{Debit} \neq \sum \text{Credit}$).
- **Side Effects**: Inserts into `invoices`, `invoice_lines`, `journal_entries`, and `journal_lines`. Updates `accounts.balance`.
- **Accounting Effect**:
  - **DEBIT**: `Accounts Receivable` (₹118,000.00)
  - **CREDIT**: `Sales Income` (₹100,000.00)
  - **CREDIT**: `Output CGST Payable` (₹9,000.00)
  - **CREDIT**: `Output SGST Payable` (₹9,000.00)
- **Killer Test Dependency**: **Killer Test 1** (Ensures $\sum \text{Debit} == \sum \text{Credit}$).

---

### 2. `POST /api/invoices/:id/void`
- **Purpose**: Voids an existing delivered invoice by posting an immutable reversing journal voucher, restoring account balances while preserving the audit log.
- **Input**:
  ```json
  {
    "reason": "Customer cancellation / incorrect billing"
  }
  ```
- **Validation**:
  - `id`: Required path parameter.
  - Invoice must exist, must have `status == 'DELIVERED'`, and must have `paidAmount == 0` (cannot void an invoice that has payments attached).
- **Output (200 OK)**:
  ```json
  {
    "id": "inv_987",
    "invoiceNumber": "INV-0001",
    "status": "VOIDED",
    "dueAmount": 0.00,
    "reversalJournalEntryId": "jv_rev_002",
    "message": "Invoice voided successfully; reversing journal entries posted."
  }
  ```
- **Authentication**: Required (`Bearer JWT`).
- **Authorization**: Role `Admin` (`invoice:void`).
- **Error Cases**:
  - `404 NOT_FOUND`: Invoice ID not found.
  - `400 BAD_REQUEST`: Invoice is already voided or is still in draft.
  - `409 CONFLICT`: Invoice has attached payments; payments must be refunded or unallocated first.
- **Side Effects**: Updates `invoices.status = 'VOIDED'`. Inserts new reversing voucher into `journal_entries` and `journal_lines`.
- **Accounting Effect**: Posts exact contra-entries:
  - **DEBIT**: `Sales Income` (₹100,000.00)
  - **DEBIT**: `Output CGST Payable` (₹9,000.00)
  - **DEBIT**: `Output SGST Payable` (₹9,000.00)
  - **CREDIT**: `Accounts Receivable` (₹118,000.00)
- **Killer Test Dependency**: **Killer Test 2** (Immutable reversal preserving audit trail).

---

### 3. `POST /api/payments`
- **Purpose**: Records a customer remittance, deposits funds into a Cash or Bank account, credits Accounts Receivable, and decrements invoice due balances.
- **Input**:
  ```json
  {
    "customerId": "cust_123",
    "paymentDate": "2026-10-06",
    "amount": 118000.00,
    "depositAccountId": "acc_bank_1010",
    "referenceNumber": "NEFT-9847120",
    "allocations": [
      {
        "invoiceId": "inv_987",
        "amount": 118000.00
      }
    ]
  }
  ```
- **Validation**:
  - `customerId`: Required, must exist.
  - `amount`: Required, number $> 0$.
  - `depositAccountId`: Required, account must be of type `ASSET` (Cash or Bank).
  - `allocations`: Required array; sum of allocations must equal `amount`.
  - For each allocation, `amount <= invoice.dueAmount`.
- **Output (201 Created)**:
  ```json
  {
    "id": "pay_555",
    "paymentNumber": "PAY-0001",
    "amount": 118000.00,
    "journalEntryId": "jv_003",
    "settledInvoices": [
      {
        "invoiceId": "inv_987",
        "paidAmount": 118000.00,
        "dueAmount": 0.00,
        "isFullyPaid": true
      }
    ]
  }
  ```
- **Authentication**: Required (`Bearer JWT`).
- **Authorization**: Role `Admin` or `Cashier` (`payment:create`).
- **Error Cases**:
  - `400 BAD_REQUEST`: Allocation sum mismatch, amount $\le 0$, invalid deposit account.
  - `404 NOT_FOUND`: Invoice or Customer ID not found.
  - `422 UNPROCESSABLE_ENTITY`: Overpayment on an invoice with smaller due balance.
- **Side Effects**: Inserts into `payments`, `payment_allocations`, `journal_entries`, `journal_lines`. Updates `invoices.paid_amount` and `invoices.due_amount`.
- **Accounting Effect**:
  - **DEBIT**: `Bank Checking Account` (₹118,000.00)
  - **CREDIT**: `Accounts Receivable` (₹118,000.00)
- **Killer Test Dependency**: **Killer Test 1** & **Killer Test 3**.

---

### 4. `GET /api/reports/trial-balance`
- **Purpose**: Generates real-time Trial Balance report aggregating all posted general ledger transactions up to the specified date.
- **Query Parameters**:
  - `toDate`: Optional ISO date (defaults to current date, e.g. `?toDate=2026-10-31`).
- **Output (200 OK)**:
  ```json
  {
    "asOfDate": "2026-10-31",
    "isBalanced": true,
    "totalDebit": 118000.00,
    "totalCredit": 118000.00,
    "difference": 0.00,
    "accounts": [
      {
        "accountId": "acc_bank_1010",
        "accountCode": "1010",
        "accountName": "Bank Checking Account",
        "type": "ASSET",
        "debit": 118000.00,
        "credit": 0.00,
        "balance": 118000.00
      },
      {
        "accountId": "acc_ar_1200",
        "accountCode": "1200",
        "accountName": "Accounts Receivable",
        "type": "ASSET",
        "debit": 118000.00,
        "credit": 118000.00,
        "balance": 0.00
      },
      {
        "accountId": "acc_cgst_2110",
        "accountCode": "2110",
        "accountName": "Output CGST Payable",
        "type": "LIABILITY",
        "debit": 0.00,
        "credit": 9000.00,
        "balance": 9000.00
      },
      {
        "accountId": "acc_sgst_2120",
        "accountCode": "2120",
        "accountName": "Output SGST Payable",
        "type": "LIABILITY",
        "debit": 0.00,
        "credit": 9000.00,
        "balance": 9000.00
      },
      {
        "accountId": "acc_sales_4000",
        "accountCode": "4000",
        "accountName": "Sales Income",
        "type": "INCOME",
        "debit": 0.00,
        "credit": 100000.00,
        "balance": 100000.00
      }
    ]
  }
  ```
- **Authentication**: Required (`Bearer JWT`).
- **Authorization**: Role `Admin` or `Auditor` (`report:view`).
- **Error Cases**:
  - `400 BAD_REQUEST`: Malformed date query format.
- **Accounting Effect**: Read-only aggregation over `journal_lines`.
- **Killer Test Dependency**: **Killer Test 3** (Verifies equilibrium across random operations).

---

### 5. `GET /api/reports/gstr-1`
- **Purpose**: Generates the statutory GSTR-1 summary report categorizing all delivered sales invoices into B2B tables and HSN-wise summaries.
- **Query Parameters**:
  - `fromDate`: Required ISO date (e.g. `?fromDate=2026-10-01`)
  - `toDate`: Required ISO date (e.g. `?toDate=2026-10-31`)
- **Output (200 OK)**:
  ```json
  {
    "period": { "fromDate": "2026-10-01", "toDate": "2026-10-31" },
    "b2bSummary": [
      {
        "customerGstin": "27AAACW1234F1Z5",
        "customerName": "Acme Wholesale Ltd",
        "invoiceNumber": "INV-0001",
        "invoiceDate": "2026-10-05",
        "placeOfSupply": "27-Maharashtra",
        "taxableValue": 100000.00,
        "rate": 18.00,
        "cgst": 9000.00,
        "sgst": 9000.00,
        "igst": 0.00,
        "totalTax": 18000.00
      }
    ],
    "hsnSummary": [
      {
        "hsnCode": "8471",
        "description": "Computers & Processing Units",
        "uqc": "NOS",
        "totalQuantity": 2,
        "totalValue": 118000.00,
        "taxableValue": 100000.00,
        "cgst": 9000.00,
        "sgst": 9000.00,
        "igst": 0.00
      }
    ]
  }
  ```
- **Authentication**: Required (`Bearer JWT`).
- **Authorization**: Role `Admin` (`report:view`).

---

### 6. `POST /api/accounts`
- **Purpose**: Creates a custom account in the Chart of Accounts.
- **Input**:
  ```json
  {
    "code": "1020",
    "name": "Petty Cash Drawer",
    "type": "ASSET",
    "normalBalance": "DEBIT"
  }
  ```
- **Validation**:
  - `code`: Required, unique.
  - `name`: Required.
  - `type`: Required enum (`ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE`).
  - `normalBalance`: Required enum (`DEBIT`, `CREDIT`).
- **Output (201 Created)**: Saved account object.

---

### 7. `GET /api/accounts`
- **Purpose**: Lists all active accounts and their current balances.
- **Output (200 OK)**: Array of account objects with running balances.

---

### 8. `GET /api/transactions`
- **Purpose**: Queries the raw immutable double-entry journal lines for audit review.
- **Query Parameters**:
  - `referenceId`: Optional filter by invoice or payment ID.
  - `accountId`: Optional filter by account.
- **Output (200 OK)**:
  ```json
  {
    "transactions": [
      {
        "id": "jl_001",
        "entryNumber": "JV-0001",
        "date": "2026-10-05",
        "accountCode": "1200",
        "accountName": "Accounts Receivable",
        "debit": 118000.00,
        "credit": 0.00,
        "referenceType": "Invoice",
        "referenceId": "inv_987"
      }
    ]
  }
  ```

---

### 9. `POST /api/ai/copilot`
- **Purpose**: Natural-language query interface enabling shop owners to ask questions about invoices, payments, journal entries, GST amounts, and trial balance integrity. Grounded strictly in live read-only accounting records.
- **Input**:
  ```json
  {
    "message": "Why does invoice INV-0001 have this GST amount?"
  }
  ```
- **Validation**:
  - `message`: Required non-empty string (max 1000 characters).
- **Output (200 OK — AI Enabled & Operational)**:
  ```json
  {
    "answer": "Invoice INV-0001 total is ₹11,800. It has a taxable subtotal of ₹10,000 across 2 units of Dell Desktop. Because the customer is located in Maharashtra (State 27, intra-state supply), the 18% GST is split equally into 9% CGST (₹900.00) and 9% SGST (₹900.00).",
    "sources": [
      "invoice:INV-0001",
      "invoice_lines:item_456",
      "gst_split:27"
    ]
  }
  ```
- **Output (200 OK — AI Disabled via Environment `AI_ENABLED=false`)**:
  ```json
  {
    "aiEnabled": false,
    "answer": "AI Accounting Copilot is currently disabled in system settings. All accounting features (Invoices, Payments, GST, Trial Balance) are running normally.",
    "sources": []
  }
  ```
- **Authentication**: Required (`Bearer JWT`).
- **Authorization**: Role `Admin` or `Accountant` (`ai:query`).
- **Error Cases**:
  - `400 BAD_REQUEST`: Empty message payload or invalid JSON format.
  - `503 SERVICE_UNAVAILABLE` (Provider Failure):
    ```json
    {
      "statusCode": 503,
      "error": "AI_PROVIDER_UNAVAILABLE",
      "message": "AI Copilot provider is temporarily unavailable or timed out. Your underlying accounting data is safe and fully operational."
    }
    ```
- **Side Effects**: **ZERO**. The endpoint is strictly read-only and prohibited from executing mutations on any table.
- **Accounting Effect**: **ZERO**. No journal lines, invoices, or payments are created or altered.
- **Killer Test Dependency**: **None (Read-Only)**. Must not interfere with or mutate any data tested by Killer Tests 1–3.

