"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const idempotency_1 = require("./middleware/idempotency");
const errorHandler_1 = require("./middleware/errorHandler");
const health_1 = __importDefault(require("./routes/health"));
const invoices_1 = __importDefault(require("./routes/invoices"));
const payments_1 = __importDefault(require("./routes/payments"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const reports_1 = __importDefault(require("./routes/reports"));
const customers_1 = __importDefault(require("./routes/customers"));
const items_1 = __importDefault(require("./routes/items"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(idempotency_1.idempotencyGuard);
// Health check endpoint
app.use('/', health_1.default);
// API v1 Routers
app.use('/api/invoices', invoices_1.default);
app.use('/api/payments', payments_1.default);
app.use('/api/accounts', accounts_1.default);
app.use('/api/transactions', transactions_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/customers', customers_1.default);
app.use('/api/items', items_1.default);
// Global Error Middleware
app.use(errorHandler_1.errorHandler);
exports.default = app;
