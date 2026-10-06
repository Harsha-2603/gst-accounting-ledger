"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictError = exports.BadRequestError = exports.NotFoundError = exports.UnbalancedTransactionError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    errorCode;
    details;
    constructor(message, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details = []) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
class UnbalancedTransactionError extends AppError {
    totalDebit;
    totalCredit;
    difference;
    constructor(totalDebit, totalCredit, difference) {
        super(`Unbalanced transaction rejected by Zero-Trust Guard: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit}). Difference: ${difference}`, 422, 'UNPROCESSABLE_ENTITY');
        this.totalDebit = totalDebit;
        this.totalCredit = totalCredit;
        this.difference = difference;
    }
}
exports.UnbalancedTransactionError = UnbalancedTransactionError;
class NotFoundError extends AppError {
    constructor(message) {
        super(message, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class BadRequestError extends AppError {
    constructor(message, details = []) {
        super(message, 400, 'BAD_REQUEST', details);
    }
}
exports.BadRequestError = BadRequestError;
class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
