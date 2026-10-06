import { toDec, fmtDec } from './decimal';
import { UnbalancedTransactionError, BadRequestError } from '../errors';

export interface JournalLineInput {
  accountId: string;
  debit: number | string;
  credit: number | string;
  description?: string;
  lineOrder?: number;
}

export interface ValidationResult {
  isBalanced: boolean;
  totalDebit: string;
  totalCredit: string;
  difference: string;
}

/**
 * Zero-Trust Transaction Balancing Guard (Fix 1 & Killer Test 1)
 * Asserts Sum(Debit) == Sum(Credit) pre-commit invariant.
 * Throws UnbalancedTransactionError if |Sum(Debit) - Sum(Credit)| >= 0.0001
 * Also asserts that no single journal line contains both debit and credit amounts.
 */
export function validateJournalBalance(journalLines: JournalLineInput[]): ValidationResult {
  if (!Array.isArray(journalLines) || journalLines.length === 0) {
    throw new UnbalancedTransactionError('0.0000', '0.0000', '0.0000');
  }

  let totalDebitDec = toDec(0);
  let totalCreditDec = toDec(0);

  journalLines.forEach((line, idx) => {
    if (!line.accountId || typeof line.accountId !== 'string') {
      throw new BadRequestError(`Journal line ${idx + 1} is missing a valid accountId.`);
    }

    const debit = toDec(line.debit || 0);
    const credit = toDec(line.credit || 0);

    if (debit.lessThan(0) || credit.lessThan(0)) {
      throw new BadRequestError(`Journal line ${idx + 1} debit and credit must be non-negative.`);
    }

    // Invariant rule: No journal line may contain both debit AND credit
    if (debit.greaterThan(0) && credit.greaterThan(0)) {
      throw new BadRequestError(`Journal line ${idx + 1} (Account ${line.accountId}) cannot contain both debit (${line.debit}) and credit (${line.credit}) amounts.`);
    }

    totalDebitDec = totalDebitDec.plus(debit);
    totalCreditDec = totalCreditDec.plus(credit);
  });

  const diffDec = totalDebitDec.minus(totalCreditDec).abs();

  if (diffDec.greaterThanOrEqualTo(0.0001)) {
    throw new UnbalancedTransactionError(
      fmtDec(totalDebitDec),
      fmtDec(totalCreditDec),
      fmtDec(diffDec)
    );
  }

  return {
    isBalanced: true,
    totalDebit: fmtDec(totalDebitDec),
    totalCredit: fmtDec(totalCreditDec),
    difference: fmtDec(diffDec)
  };
}
