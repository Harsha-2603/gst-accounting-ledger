"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOGNIZED_GST_SLABS = void 0;
exports.calculateGST = calculateGST;
const decimal_1 = require("./decimal");
const errors_1 = require("../errors");
exports.RECOGNIZED_GST_SLABS = [0, 5, 12, 18, 28];
/**
 * Calculates Indian GST tax bifurcation (CGST/SGST/IGST) per line item.
 *
 * Rules:
 * - INTRA-STATE (supplierState == customerState): 50% CGST + 50% SGST, 0% IGST.
 * - INTER-STATE (supplierState != customerState): 0% CGST, 0% SGST, 100% IGST.
 * - Validates recognized GST slabs (0, 5, 12, 18, 28).
 * - Requires non-empty HSN/SAC code per line item.
 */
function calculateGST(supplierState, customerState, lines) {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
        throw new errors_1.BadRequestError('Invoice lines array with at least 1 item is required.');
    }
    const isIntraState = String(supplierState).trim() === String(customerState).trim();
    let subtotalDec = (0, decimal_1.toDec)(0);
    let cgstTotalDec = (0, decimal_1.toDec)(0);
    let sgstTotalDec = (0, decimal_1.toDec)(0);
    let igstTotalDec = (0, decimal_1.toDec)(0);
    const processedLines = lines.map((line, idx) => {
        // 1. Validate HSN/SAC Code
        if (!line.hsnCode || typeof line.hsnCode !== 'string' || line.hsnCode.trim() === '') {
            throw new errors_1.BadRequestError(`Line item ${idx + 1} requires a valid HSN/SAC code.`);
        }
        const rateNum = (0, decimal_1.numVal)(line.taxRate);
        if (!exports.RECOGNIZED_GST_SLABS.includes(rateNum)) {
            throw new errors_1.BadRequestError(`Unrecognized GST slab '${rateNum}%' on line item ${idx + 1}. Must be one of: 0, 5, 12, 18, 28.`);
        }
        const qty = (0, decimal_1.toDec)(line.quantity);
        const unitPrice = (0, decimal_1.toDec)(line.unitPrice);
        const taxRate = (0, decimal_1.toDec)(line.taxRate);
        const taxableAmount = qty.times(unitPrice);
        subtotalDec = subtotalDec.plus(taxableAmount);
        let cgstRate = (0, decimal_1.toDec)(0);
        let cgstAmount = (0, decimal_1.toDec)(0);
        let sgstRate = (0, decimal_1.toDec)(0);
        let sgstAmount = (0, decimal_1.toDec)(0);
        let igstRate = (0, decimal_1.toDec)(0);
        let igstAmount = (0, decimal_1.toDec)(0);
        if (isIntraState) {
            if (!taxRate.isZero()) {
                cgstRate = taxRate.dividedBy(2);
                sgstRate = taxRate.dividedBy(2);
                cgstAmount = taxableAmount.times(cgstRate).dividedBy(100);
                sgstAmount = taxableAmount.times(sgstRate).dividedBy(100);
            }
            cgstTotalDec = cgstTotalDec.plus(cgstAmount);
            sgstTotalDec = sgstTotalDec.plus(sgstAmount);
        }
        else {
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
            quantity: (0, decimal_1.fmtDec)(qty),
            unitPrice: (0, decimal_1.fmtDec)(unitPrice),
            taxRate: (0, decimal_1.fmtDec)(taxRate, 2),
            taxableAmount: (0, decimal_1.fmtDec)(taxableAmount),
            cgstRate: (0, decimal_1.fmtDec)(cgstRate, 2),
            cgstAmount: (0, decimal_1.fmtDec)(cgstAmount),
            sgstRate: (0, decimal_1.fmtDec)(sgstRate, 2),
            sgstAmount: (0, decimal_1.fmtDec)(sgstAmount),
            igstRate: (0, decimal_1.fmtDec)(igstRate, 2),
            igstAmount: (0, decimal_1.fmtDec)(igstAmount),
            totalLineAmount: (0, decimal_1.fmtDec)(totalLineAmount)
        };
    });
    const grandTotalDec = subtotalDec.plus(cgstTotalDec).plus(sgstTotalDec).plus(igstTotalDec);
    return {
        isIntraState,
        subtotal: (0, decimal_1.fmtDec)(subtotalDec),
        cgstAmount: (0, decimal_1.fmtDec)(cgstTotalDec),
        sgstAmount: (0, decimal_1.fmtDec)(sgstTotalDec),
        igstAmount: (0, decimal_1.fmtDec)(igstTotalDec),
        totalAmount: (0, decimal_1.fmtDec)(grandTotalDec),
        processedLines
    };
}
