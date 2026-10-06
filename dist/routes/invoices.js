"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const invoiceService = __importStar(require("../services/invoiceService"));
const validation_1 = require("../validation");
const errors_1 = require("../errors");
const router = (0, express_1.Router)();
router.post('/', (req, res, next) => {
    try {
        (0, validation_1.validateCreateInvoiceDTO)(req.body);
        const result = invoiceService.createInvoice(req.body);
        res.status(201).json(result);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/void', (req, res, next) => {
    try {
        const id = req.params.id;
        const reason = req.body ? req.body.reason : undefined;
        const result = invoiceService.voidInvoice(id, reason);
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
});
router.get('/', (req, res, next) => {
    try {
        const invoices = invoiceService.getInvoices(req.query);
        res.status(200).json(invoices);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', (req, res, next) => {
    try {
        const id = req.params.id;
        const invoice = invoiceService.getInvoiceById(id);
        if (!invoice) {
            throw new errors_1.NotFoundError(`Invoice '${id}' not found.`);
        }
        res.status(200).json(invoice);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
