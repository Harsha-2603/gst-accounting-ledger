import { toDec, fmtDec, numVal } from './decimal';
import { BadRequestError } from '../errors';

export interface InvoiceLineInput {
  itemId?: string;
  description?: string;
  hsnCode: string;
  quantity: number | string;
  unitPrice: number | string;
  taxRate: number | string;
}

export interface ProcessedGSTLine {
  itemId: string;
  description: string;
  hsnCode: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxableAmount: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  totalLineAmount: string;
}

export interface GSTCalculationResult {
  isIntraState: boolean;
  subtotal: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  processedLines: ProcessedGSTLine[];
}

export const RECOGNIZED_GST_SLABS = [0, 5, 12, 18, 28];

/**
 * Calculates Indian GST tax bifurcation (CGST/SGST/IGST) per line item.
 * 
 * Rules:
 * - INTRA-STATE (supplierState == customerState): 50% CGST + 50% SGST, 0% IGST.
 * - INTER-STATE (supplierState != customerState): 0% CGST, 0% SGST, 100% IGST.
 * - Validates recognized GST slabs (0, 5, 12, 18, 28).
 * - Requires non-empty HSN/SAC code per line item.
 */
export function calculateGST(
  supplierState: string,
  customerState: string,
  lines: InvoiceLineInput[]
): GSTCalculationResult {
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw new BadRequestError('Invoice lines array with at least 1 item is required.');
  }

  const isIntraState = String(supplierState).trim() === String(customerState).trim();

  let subtotalDec = toDec(0);
  let cgstTotalDec = toDec(0);
  let sgstTotalDec = toDec(0);
  let igstTotalDec = toDec(0);

  const processedLines: ProcessedGSTLine[] = lines.map((line, idx) => {
    // 1. Validate HSN/SAC Code
    if (!line.hsnCode || typeof line.hsnCode !== 'string' || line.hsnCode.trim() === '') {
      throw new BadRequestError(`Line item ${idx + 1} requires a valid HSN/SAC code.`);
    }

    const rateNum = numVal(line.taxRate);
    if (!RECOGNIZED_GST_SLABS.includes(rateNum)) {
      throw new BadRequestError(`Unrecognized GST slab '${rateNum}%' on line item ${idx + 1}. Must be one of: 0, 5, 12, 18, 28.`);
    }

    const qty = toDec(line.quantity);
    const unitPrice = toDec(line.unitPrice);
    const taxRate = toDec(line.taxRate);

    const taxableAmount = qty.times(unitPrice);
    subtotalDec = subtotalDec.plus(taxableAmount);

    let cgstRate = toDec(0);
    let cgstAmount = toDec(0);
    let sgstRate = toDec(0);
    let sgstAmount = toDec(0);
    let igstRate = toDec(0);
    let igstAmount = toDec(0);

    if (isIntraState) {
      if (!taxRate.isZero()) {
        cgstRate = taxRate.dividedBy(2);
        sgstRate = taxRate.dividedBy(2);
        cgstAmount = taxableAmount.times(cgstRate).dividedBy(100);
        sgstAmount = taxableAmount.times(sgstRate).dividedBy(100);
      }
      cgstTotalDec = cgstTotalDec.plus(cgstAmount);
      sgstTotalDec = sgstTotalDec.plus(sgstAmount);
    } else {
      if (!taxRate.isZero()) {
        igstRate = taxRate;
        igstAmount = taxableAmount.times(igstRate).dividedBy(100);
      }
      igstTotalDec = igstTotalDec.plus(igstAmount);
    }

    const totalLineAmount = taxableAmount.plus(cgstAmount).plus(sgstAmount).plus(igstAmount);

    return {
      itemId: line.itemId || 'item_custom',
      description: line.description || '',
      hsnCode: line.hsnCode.trim(),
      quantity: fmtDec(qty),
      unitPrice: fmtDec(unitPrice),
      taxRate: fmtDec(taxRate, 2),
      taxableAmount: fmtDec(taxableAmount),
      cgstRate: fmtDec(cgstRate, 2),
      cgstAmount: fmtDec(cgstAmount),
      sgstRate: fmtDec(sgstRate, 2),
      sgstAmount: fmtDec(sgstAmount),
      igstRate: fmtDec(igstRate, 2),
      igstAmount: fmtDec(igstAmount),
      totalLineAmount: fmtDec(totalLineAmount)
    };
  });

  const grandTotalDec = subtotalDec.plus(cgstTotalDec).plus(sgstTotalDec).plus(igstTotalDec);

  return {
    isIntraState,
    subtotal: fmtDec(subtotalDec),
    cgstAmount: fmtDec(cgstTotalDec),
    sgstAmount: fmtDec(sgstTotalDec),
    igstAmount: fmtDec(igstTotalDec),
    totalAmount: fmtDec(grandTotalDec),
    processedLines
  };
}
