import Decimal from 'decimal.js';
export { Decimal };
export declare function toDec(val: any): Decimal;
export declare function fmtDec(val: any, dp?: number): string;
export declare function fmtMoney(val: any): string;
export declare function numVal(val: any): number;
export declare function isZero(val: any): boolean;
export declare function eq(val1: any, val2: any, tolerance?: number): boolean;
