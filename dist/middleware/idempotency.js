"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotencyGuard = idempotencyGuard;
const database_1 = require("../database");
const crypto_1 = __importDefault(require("crypto"));
function idempotencyGuard(req, res, next) {
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    if (!idempotencyKey || req.method === 'GET') {
        return next();
    }
    const cleanKey = String(idempotencyKey).trim();
    const existing = database_1.db.prepare('SELECT status_code, response_body FROM idempotency_keys WHERE key = ?').get(cleanKey);
    if (existing) {
        res.setHeader('X-Cache-Hit', 'Idempotency-Guard');
        res.status(existing.status_code).json(JSON.parse(existing.response_body));
        return;
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
                const id = 'idem_' + crypto_1.default.randomUUID().slice(0, 8);
                const now = new Date().toISOString();
                database_1.db.prepare(`
          INSERT OR IGNORE INTO idempotency_keys (id, key, request_hash, response_body, status_code, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, cleanKey, req.originalUrl, JSON.stringify(body), res.statusCode, now);
            }
            catch (err) {
                console.error('Idempotency persistence warning:', err.message);
            }
        }
        return originalJson(body);
    };
    next();
}
