"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = __importDefault(require("./server"));
const config_1 = require("./config");
const server = server_1.default.listen(config_1.config.port, config_1.config.host, () => {
    console.log(`🚀 GST-Ready Accounting Ledger backend running at http://${config_1.config.host}:${config_1.config.port}`);
    console.log(`📊 Environment: ${config_1.config.env}`);
});
exports.default = server;
