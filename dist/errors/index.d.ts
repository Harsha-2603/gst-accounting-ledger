export declare class AppError extends Error {
    statusCode: number;
    errorCode: string;
    details?: any[];
    constructor(message: string, statusCode?: number, errorCode?: string, details?: any[]);
}
export declare class UnbalancedTransactionError extends AppError {
    totalDebit: string;
    totalCredit: string;
    difference: string;
    constructor(totalDebit: string, totalCredit: string, difference: string);
}
export declare class NotFoundError extends AppError {
    constructor(message: string);
}
export declare class BadRequestError extends AppError {
    constructor(message: string, details?: any[]);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
