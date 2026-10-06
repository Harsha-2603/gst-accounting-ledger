"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '127.0.0.1',
    databasePath: process.env.DATABASE_PATH || path_1.default.join(__dirname, '../../gst_ledger.db'),
    baseCurrency: process.env.BASE_CURRENCY || 'INR',
    defaultStateCode: process.env.DEFAULT_STATE_CODE || '27',
    env: process.env.NODE_ENV || 'development'
};
