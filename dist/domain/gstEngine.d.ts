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
export declare const RECOGNIZED_GST_SLABS: number[];
/**
 * Calculates Indian GST tax bifurcation (CGST/SGST/IGST) per line item.
 *
 * Rules:
 * - INTRA-STATE (supplierState == customerState): 50% CGST + 50% SGST, 0% IGST.
 * - INTER-STATE (supplierState != customerState): 0% CGST, 0% SGST, 100% IGST.
 * - Validates recognized GST slabs (0, 5, 12, 18, 28).
 * - Requires non-empty HSN/SAC code per line item.
 */
export declare function calculateGST(supplierState: string, customerState: string, lines: InvoiceLineInput[]): GSTCalculationResult;
