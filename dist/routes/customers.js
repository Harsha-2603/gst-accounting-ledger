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
exports.default = router;
