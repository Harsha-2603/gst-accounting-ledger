export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details?: any[];

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details: any[] = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnbalancedTransactionError extends AppError {
  public totalDebit: string;
  public totalCredit: string;
  public difference: string;

  constructor(totalDebit: string, totalCredit: string, difference: string) {
    super(
      `Unbalanced transaction rejected by Zero-Trust Guard: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit}). Difference: ${difference}`,
      422,
      'UNPROCESSABLE_ENTITY'
    );
    this.totalDebit = totalDebit;
    this.totalCredit = totalCredit;
    this.difference = difference;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details: any[] = []) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}
