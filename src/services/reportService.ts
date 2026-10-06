import { db } from '../database';
import { toDec, numVal } from '../domain/decimal';

export interface TrialBalanceAccountDTO {
  accountId: string;
  accountCode: string;
  accountName: string;
  type: string;
  normalBalance: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceResult {
  asOfDate: string;
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  accounts: TrialBalanceAccountDTO[];
}

export function getTrialBalance(toDate?: string): TrialBalanceResult {
  const asOfDate = toDate || new Date().toISOString().slice(0, 10);

  const accountAggregations = db.prepare(`
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
  `).all(asOfDate) as any[];

  let grandDebitDec = toDec(0);
  let grandCreditDec = toDec(0);

  const accountRows: TrialBalanceAccountDTO[] = accountAggregations.map(acc => {
    const debitDec = toDec(acc.totalDebit);
    const creditDec = toDec(acc.totalCredit);

    grandDebitDec = grandDebitDec.plus(debitDec);
    grandCreditDec = grandCreditDec.plus(creditDec);

    let netBalanceDec = toDec(0);
    if (acc.normalBalance === 'DEBIT') {
      netBalanceDec = debitDec.minus(creditDec);
    } else {
      netBalanceDec = creditDec.minus(debitDec);
    }

    return {
      accountId: acc.accountId,
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      type: acc.type,
      normalBalance: acc.normalBalance,
      debit: numVal(debitDec),
      credit: numVal(creditDec),
      balance: numVal(netBalanceDec)
    };
  });

  const diffDec = grandDebitDec.minus(grandCreditDec).abs();
  const isBalanced = diffDec.lessThan(0.0001);

  return {
    asOfDate,
    isBalanced,
    totalDebit: numVal(grandDebitDec),
    totalCredit: numVal(grandCreditDec),
    difference: numVal(diffDec),
    accounts: accountRows
  };
}

export function getGSTR1(fromDate?: string, toDate?: string): any {
  const fDate = fromDate || '1970-01-01';
  const tDate = toDate || '2099-12-31';

  const b2bInvoices = db.prepare(`
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
  `).all(fDate, tDate) as any[];

  const b2bSummary = b2bInvoices.map(inv => {
    const taxValDec = toDec(inv.taxableValue);
    const cgstDec = toDec(inv.cgst);
    const sgstDec = toDec(inv.sgst);
    const igstDec = toDec(inv.igst);
    const totalTaxDec = cgstDec.plus(sgstDec).plus(igstDec);

    let effectiveRate = 18.0;
    if (!taxValDec.isZero()) {
      effectiveRate = numVal(totalTaxDec.times(100).dividedBy(taxValDec));
    }

    const stateNames: Record<string, string> = { '27': '27-Maharashtra', '24': '24-Gujarat', '07': '07-Delhi', '29': '29-Karnataka' };
    const placeOfSupplyStr = stateNames[inv.placeOfSupplyCode] || `${inv.placeOfSupplyCode}-State`;

    return {
      customerGstin: inv.customerGstin || 'URP',
      customerName: inv.customerName,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      placeOfSupply: placeOfSupplyStr,
      taxableValue: numVal(taxValDec),
      rate: parseFloat(effectiveRate.toFixed(2)),
      cgst: numVal(cgstDec),
      sgst: numVal(sgstDec),
      igst: numVal(igstDec),
      totalTax: numVal(totalTaxDec)
    };
  });

  const hsnRows = db.prepare(`
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
  `).all(fDate, tDate) as any[];

  const hsnSummary = hsnRows.map(h => ({
    hsnCode: h.hsnCode,
    description: h.description || 'Goods / Services',
    uqc: 'NOS',
    totalQuantity: Math.round(h.totalQuantity),
    totalValue: numVal(h.totalValue),
    taxableValue: numVal(h.taxableValue),
    cgst: numVal(h.cgst),
    sgst: numVal(h.sgst),
    igst: numVal(h.igst)
  }));

  return {
    period: { fromDate: fDate, toDate: tDate },
    b2bSummary,
    hsnSummary
  };
}
