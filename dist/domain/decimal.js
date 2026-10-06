"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decimal = void 0;
exports.toDec = toDec;
exports.fmtDec = fmtDec;
exports.fmtMoney = fmtMoney;
exports.numVal = numVal;
exports.isZero = isZero;
exports.eq = eq;
const decimal_js_1 = __importDefault(require("decimal.js"));
exports.Decimal = decimal_js_1.default;
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
function toDec(val) {
    if (val === null || val === undefined || val === '')
        return new decimal_js_1.default(0);
    return new decimal_js_1.default(val);
}
function fmtDec(val, dp = 4) {
    return toDec(val).toFixed(dp);
}
function fmtMoney(val) {
    return toDec(val).toFixed(2);
}
function numVal(val) {
    return toDec(val).toNumber();
}
function isZero(val) {
    return toDec(val).isZero();
}
function eq(val1, val2, tolerance = 0.0001) {
    const diff = toDec(val1).minus(toDec(val2)).abs();
    return diff.lessThan(tolerance);
}
