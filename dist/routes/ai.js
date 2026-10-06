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
const aiCopilotService = __importStar(require("../services/aiCopilotService"));
const router = (0, express_1.Router)();
router.post('/copilot', async (req, res, next) => {
    try {
        const { message } = req.body;
        if (!message || typeof message !== 'string' || message.trim() === '') {
            res.status(400).json({
                statusCode: 400,
                error: 'BAD_REQUEST',
                message: 'Message field is required and must be a non-empty string.',
                details: []
            });
            return;
        }
        if (message.length > 1000) {
            res.status(400).json({
                statusCode: 400,
                error: 'BAD_REQUEST',
                message: 'Message length exceeds the maximum allowed limit of 1000 characters.',
                details: []
            });
            return;
        }
        const result = await aiCopilotService.askCopilot(message);
        res.status(200).json(result);
    }
    catch (err) {
        if (err.statusCode === 503 || err.code === 'AI_PROVIDER_UNAVAILABLE') {
            res.status(503).json({
                statusCode: 503,
                error: 'AI_PROVIDER_UNAVAILABLE',
                message: 'AI Copilot provider is temporarily unavailable or timed out. Your underlying accounting data is safe and fully operational.'
            });
            return;
        }
        next(err);
    }
});
exports.default = router;
