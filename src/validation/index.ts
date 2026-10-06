import { BadRequestError } from '../errors';

export function validateCreateInvoiceDTO(body: any): void {
  if (!body || typeof body !== 'object') {
    throw new BadRequestError('Request body must be a valid JSON object.');
  }

  if (!body.customerId || typeof body.customerId !== 'string') {
    throw new BadRequestError('customerId is required and must be a string.');
  }

  if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw new BadRequestError('lines array is required and must contain at least 1 line item.');
  }

  body.lines.forEach((line: any, idx: number) => {
    if (line.quantity === undefined || Number(line.quantity) <= 0) {
      throw new BadRequestError(`Line ${idx + 1}: quantity must be a number greater than 0.`);
    }
    if (line.unitPrice === undefined || Number(line.unitPrice) < 0) {
      throw new BadRequestError(`Line ${idx + 1}: unitPrice must be a non-negative number.`);
    }
  });
}

export function validateCreatePaymentDTO(body: any): void {
  if (!body || typeof body !== 'object') {
    throw new BadRequestError('Request body must be a valid JSON object.');
  }

  if (!body.customerId || typeof body.customerId !== 'string') {
    throw new BadRequestError('customerId is required and must be a string.');
  }

  if (body.amount === undefined || Number(body.amount) <= 0) {
    throw new BadRequestError('Payment amount must be a number greater than 0.');
  }

  if (!body.depositAccountId || typeof body.depositAccountId !== 'string') {
    throw new BadRequestError('depositAccountId is required.');
  }

  if (!body.allocations || !Array.isArray(body.allocations) || body.allocations.length === 0) {
    throw new BadRequestError('allocations array is required.');
  }
}
