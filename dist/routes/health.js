"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const router = (0, express_1.Router)();
router.get('/health', (req, res) => {
    try {
        const dbTest = database_1.db.prepare('SELECT 1 as ok').get();
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: dbTest && dbTest.ok === 1 ? 'CONNECTED' : 'DISCONNECTED',
            uptime: process.uptime()
        });
    }
    catch (err) {
        res.status(500).json({
            status: 'ERROR',
            message: err.message
        });
    }
});
exports.default = router;
