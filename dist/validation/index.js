"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateInvoiceDTO = validateCreateInvoiceDTO;
exports.validateCreatePaymentDTO = validateCreatePaymentDTO;
const errors_1 = require("../errors");
function validateCreateInvoiceDTO(body) {
    if (!body || typeof body !== 'object') {
        throw new errors_1.BadRequestError('Request body must be a valid JSON object.');
    }
    if (!body.customerId || typeof body.customerId !== 'string') {
        throw new errors_1.BadRequestError('customerId is required and must be a string.');
    }
    if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        throw new errors_1.BadRequestError('lines array is required and must contain at least 1 line item.');
    }
    body.lines.forEach((line, idx) => {
        if (line.quantity === undefined || Number(line.quantity) <= 0) {
            throw new errors_1.BadRequestError(`Line ${idx + 1}: quantity must be a number greater than 0.`);
        }
        if (line.unitPrice === undefined || Number(line.unitPrice) < 0) {
            throw new errors_1.BadRequestError(`Line ${idx + 1}: unitPrice must be a non-negative number.`);
        }
    });
}
function validateCreatePaymentDTO(body) {
    if (!body || typeof body !== 'object') {
        throw new errors_1.BadRequestError('Request body must be a valid JSON object.');
    }
    if (!body.customerId || typeof body.customerId !== 'string') {
        throw new errors_1.BadRequestError('customerId is required and must be a string.');
    }
    if (body.amount === undefined || Number(body.amount) <= 0) {
        throw new errors_1.BadRequestError('Payment amount must be a number greater than 0.');
    }
    if (!body.depositAccountId || typeof body.depositAccountId !== 'string') {
        throw new errors_1.BadRequestError('depositAccountId is required.');
    }
    if (!body.allocations || !Array.isArray(body.allocations) || body.allocations.length === 0) {
        throw new errors_1.BadRequestError('allocations array is required.');
    }
}
