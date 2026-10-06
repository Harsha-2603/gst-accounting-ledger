import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function toDec(val: any): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  return new Decimal(val);
}

export function fmtDec(val: any, dp = 4): string {
  return toDec(val).toFixed(dp);
}

export function fmtMoney(val: any): string {
  return toDec(val).toFixed(2);
}

export function numVal(val: any): number {
  return toDec(val).toNumber();
}

export function isZero(val: any): boolean {
  return toDec(val).isZero();
}

export function eq(val1: any, val2: any, tolerance = 0.0001): boolean {
  const diff = toDec(val1).minus(toDec(val2)).abs();
  return diff.lessThan(tolerance);
}
