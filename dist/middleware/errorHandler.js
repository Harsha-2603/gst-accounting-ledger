"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const errorCode = err.errorCode || (statusCode === 422 ? 'UNPROCESSABLE_ENTITY' :
        statusCode === 409 ? 'CONFLICT' :
            statusCode === 404 ? 'NOT_FOUND' :
                statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR');
    res.status(statusCode).json({
        statusCode,
        error: errorCode,
        message: err.message || 'An unexpected error occurred.',
        details: err.details || []
    });
}
