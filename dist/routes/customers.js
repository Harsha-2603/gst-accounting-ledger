"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const router = (0, express_1.Router)();
router.get('/', (req, res, next) => {
    try {
        const customers = database_1.db.prepare('SELECT id, name, gstin, state_code as stateCode, email, phone FROM customers ORDER BY name ASC').all();
        res.status(200).json(customers);
    }
    catch (err) {
        next(err);
    }
});
router.post('/', (req, res, next) => {
    try {
        const { name, gstin, stateCode, email, phone } = req.body;
        if (!name || typeof name !== 'string') {
            res.status(400).json({ statusCode: 400, error: 'BAD_REQUEST', message: 'Customer name is required.' });
            return;
        }
        const id = 'cust_' + Math.random().toString(36).slice(2, 10);
        const now = new Date().toISOString();
        const sc = stateCode || '27';
        database_1.db.prepare(`
      INSERT INTO customers (id, name, gstin, state_code, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, gstin || null, sc, email || null, phone || null, now);
        res.status(201).json({ id, name, gstin, stateCode: sc, email, phone, createdAt: now });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
