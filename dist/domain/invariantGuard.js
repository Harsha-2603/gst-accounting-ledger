"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJournalBalance = validateJournalBalance;
const decimal_1 = require("./decimal");
const errors_1 = require("../errors");
/**
 * Zero-Trust Transaction Balancing Guard (Fix 1 & Killer Test 1)
 * Asserts Sum(Debit) == Sum(Credit) pre-commit invariant.
 * Throws UnbalancedTransactionError if |Sum(Debit) - Sum(Credit)| >= 0.0001
 * Also asserts that no single journal line contains both debit and credit amounts.
 */
function validateJournalBalance(journalLines) {
    if (!Array.isArray(journalLines) || journalLines.length === 0) {
        throw new errors_1.UnbalancedTransactionError('0.0000', '0.0000', '0.0000');
    }
    let totalDebitDec = (0, decimal_1.toDec)(0);
    let totalCreditDec = (0, decimal_1.toDec)(0);
    journalLines.forEach((line, idx) => {
        if (!line.accountId || typeof line.accountId !== 'string') {
            throw new errors_1.BadRequestError(`Journal line ${idx + 1} is missing a valid accountId.`);
        }
        const debit = (0, decimal_1.toDec)(line.debit || 0);
        const credit = (0, decimal_1.toDec)(line.credit || 0);
        if (debit.lessThan(0) || credit.lessThan(0)) {
            throw new errors_1.BadRequestError(`Journal line ${idx + 1} debit and credit must be non-negative.`);
        }
        // Invariant rule: No journal line may contain both debit AND credit
        if (debit.greaterThan(0) && credit.greaterThan(0)) {
            throw new errors_1.BadRequestError(`Journal line ${idx + 1} (Account ${line.accountId}) cannot contain both debit (${line.debit}) and credit (${line.credit}) amounts.`);
        }
        totalDebitDec = totalDebitDec.plus(debit);
        totalCreditDec = totalCreditDec.plus(credit);
    });
    const diffDec = totalDebitDec.minus(totalCreditDec).abs();
    if (diffDec.greaterThanOrEqualTo(0.0001)) {
        throw new errors_1.UnbalancedTransactionError((0, decimal_1.fmtDec)(totalDebitDec), (0, decimal_1.fmtDec)(totalCreditDec), (0, decimal_1.fmtDec)(diffDec));
    }
    return {
        isBalanced: true,
        totalDebit: (0, decimal_1.fmtDec)(totalDebitDec),
        totalCredit: (0, decimal_1.fmtDec)(totalCreditDec),
        difference: (0, decimal_1.fmtDec)(diffDec)
    };
}
