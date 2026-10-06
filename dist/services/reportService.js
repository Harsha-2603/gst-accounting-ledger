"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrialBalance = getTrialBalance;
exports.getGSTR1 = getGSTR1;
const database_1 = require("../database");
const decimal_1 = require("../domain/decimal");
function getTrialBalance(toDate) {
    const asOfDate = toDate || new Date().toISOString().slice(0, 10);
    const accountAggregations = database_1.db.prepare(`
    SELECT 
      a.id as accountId,
      a.code as accountCode,
      a.name as accountName,
      a.type as type,
      a.normal_balance as normalBalance,
      COALESCE(SUM(CAST(jl.debit AS REAL)), 0) as totalDebit,
      COALESCE(SUM(CAST(jl.credit AS REAL)), 0) as totalCredit
    FROM accounts a
    LEFT JOIN journal_lines jl ON a.id = jl.account_id
    LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id AND je.entry_date <= ?
    WHERE a.is_active = 1
    GROUP BY a.id, a.code, a.name, a.type, a.normal_balance
    ORDER BY a.code ASC
  `).all(asOfDate);
    let grandDebitDec = (0, decimal_1.toDec)(0);
    let grandCreditDec = (0, decimal_1.toDec)(0);
    const accountRows = accountAggregations.map(acc => {
        const debitDec = (0, decimal_1.toDec)(acc.totalDebit);
        const creditDec = (0, decimal_1.toDec)(acc.totalCredit);
        grandDebitDec = grandDebitDec.plus(debitDec);
        grandCreditDec = grandCreditDec.plus(creditDec);
        let netBalanceDec = (0, decimal_1.toDec)(0);
        if (acc.normalBalance === 'DEBIT') {
            netBalanceDec = debitDec.minus(creditDec);
        }
        else {
            netBalanceDec = creditDec.minus(debitDec);
        }
        return {
            accountId: acc.accountId,
            accountCode: acc.accountCode,
            accountName: acc.accountName,
            type: acc.type,
            normalBalance: acc.normalBalance,
            debit: (0, decimal_1.numVal)(debitDec),
            credit: (0, decimal_1.numVal)(creditDec),
            balance: (0, decimal_1.numVal)(netBalanceDec)
        };
    });
    const diffDec = grandDebitDec.minus(grandCreditDec).abs();
    const isBalanced = diffDec.lessThan(0.0001);
    return {
        asOfDate,
        isBalanced,
        totalDebit: (0, decimal_1.numVal)(grandDebitDec),
        totalCredit: (0, decimal_1.numVal)(grandCreditDec),
        difference: (0, decimal_1.numVal)(diffDec),
        accounts: accountRows
    };
}
function getGSTR1(fromDate, toDate) {
    const fDate = fromDate || '1970-01-01';
    const tDate = toDate || '2099-12-31';
    const b2bInvoices = database_1.db.prepare(`
    SELECT 
      c.gstin as customerGstin,
      c.name as customerName,
      i.invoice_number as invoiceNumber,
      i.invoice_date as invoiceDate,
      i.place_of_supply as placeOfSupplyCode,
      i.subtotal as taxableValue,
      i.cgst_amount as cgst,
      i.sgst_amount as sgst,
      i.igst_amount as igst,
      i.total_amount as totalAmount
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.status = 'DELIVERED'
      AND i.invoice_date >= ?
      AND i.invoice_date <= ?
    ORDER BY i.invoice_date ASC, i.invoice_number ASC
  `).all(fDate, tDate);
    const b2bSummary = b2bInvoices.map(inv => {
        const taxValDec = (0, decimal_1.toDec)(inv.taxableValue);
        const cgstDec = (0, decimal_1.toDec)(inv.cgst);
        const sgstDec = (0, decimal_1.toDec)(inv.sgst);
        const igstDec = (0, decimal_1.toDec)(inv.igst);
        const totalTaxDec = cgstDec.plus(sgstDec).plus(igstDec);
        let effectiveRate = 18.0;
        if (!taxValDec.isZero()) {
            effectiveRate = (0, decimal_1.numVal)(totalTaxDec.times(100).dividedBy(taxValDec));
        }
        const stateNames = { '27': '27-Maharashtra', '24': '24-Gujarat', '07': '07-Delhi', '29': '29-Karnataka' };
        const placeOfSupplyStr = stateNames[inv.placeOfSupplyCode] || `${inv.placeOfSupplyCode}-State`;
        return {
            customerGstin: inv.customerGstin || 'URP',
            customerName: inv.customerName,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            placeOfSupply: placeOfSupplyStr,
            taxableValue: (0, decimal_1.numVal)(taxValDec),
            rate: parseFloat(effectiveRate.toFixed(2)),
            cgst: (0, decimal_1.numVal)(cgstDec),
            sgst: (0, decimal_1.numVal)(sgstDec),
            igst: (0, decimal_1.numVal)(igstDec),
            totalTax: (0, decimal_1.numVal)(totalTaxDec)
        };
    });
    const hsnRows = database_1.db.prepare(`
    SELECT 
      il.hsn_code as hsnCode,
      il.description as description,
      SUM(CAST(il.quantity AS REAL)) as totalQuantity,
      SUM(CAST(il.taxable_amount AS REAL)) as taxableValue,
      SUM(CAST(il.cgst_amount AS REAL)) as cgst,
      SUM(CAST(il.sgst_amount AS REAL)) as sgst,
      SUM(CAST(il.igst_amount AS REAL)) as igst,
      SUM(CAST(il.total_line_amount AS REAL)) as totalValue
    FROM invoice_lines il
    JOIN invoices i ON il.invoice_id = i.id
    WHERE i.status = 'DELIVERED'
      AND i.invoice_date >= ?
      AND i.invoice_date <= ?
    GROUP BY il.hsn_code
  `).all(fDate, tDate);
    const hsnSummary = hsnRows.map(h => ({
        hsnCode: h.hsnCode,
        description: h.description || 'Goods / Services',
        uqc: 'NOS',
        totalQuantity: Math.round(h.totalQuantity),
        totalValue: (0, decimal_1.numVal)(h.totalValue),
        taxableValue: (0, decimal_1.numVal)(h.taxableValue),
        cgst: (0, decimal_1.numVal)(h.cgst),
        sgst: (0, decimal_1.numVal)(h.sgst),
        igst: (0, decimal_1.numVal)(h.igst)
    }));
    return {
        period: { fromDate: fDate, toDate: tDate },
        b2bSummary,
        hsnSummary
    };
}
